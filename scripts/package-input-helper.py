#!/usr/bin/env python3
import hashlib
import json
import os
import secrets
import stat
import sys
from dataclasses import dataclass
SELECTORS = ("dist", "docs", "examples", "CHANGELOG.md")
DIRECTORIES = frozenset(("dist", "docs", "examples"))
REQUEST_ID = ""
class Invalid(Exception): pass
class Race(Exception): pass
@dataclass(frozen=True, slots=True)
class Selector:
    name: str
    target: str | None
    identity: tuple[int, int, int, int] | None
def emit(message: dict[str, object]) -> None: sys.stdout.write(json.dumps(message, ensure_ascii=True, separators=(",", ":"), sort_keys=True) + "\n"); sys.stdout.flush()


def identity(info: os.stat_result) -> tuple[int, int, int]: return (info.st_dev, info.st_ino, stat.S_IFMT(info.st_mode))
def selector_identity(info: os.stat_result) -> tuple[int, int, int, int]: return (*identity(info), info.st_ctime_ns)


def flags(directory: bool) -> int:
    return os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | (os.O_DIRECTORY if directory else 0)


def open_directory(path: str) -> int:
    try:
        return os.open(path, flags(True))
    except OSError as error:
        raise Invalid from error


def snapshot_selector(root_fd: int, global_path: str, name: str) -> Selector:
    try:
        info = os.stat(name, dir_fd=root_fd, follow_symlinks=False)
    except FileNotFoundError:
        return Selector(name, None, None)
    except OSError as error:
        raise Invalid from error
    if not stat.S_ISLNK(info.st_mode):
        raise Invalid
    try:
        target = os.readlink(name, dir_fd=root_fd)
    except OSError as error:
        raise Invalid from error
    if target != os.path.join(global_path, name):
        raise Invalid
    return Selector(name, target, selector_identity(info))


def valid_mode(info: os.stat_result, directory: bool) -> bool: return stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)


def readable(info: os.stat_result, directory: bool) -> bool: return bool(info.st_mode & (0o555 if directory else 0o444))


def manifest(fd: int, path: str = "") -> list[dict[str, object]]:
    info = os.fstat(fd)
    if stat.S_ISREG(info.st_mode):
        if not readable(info, False):
            raise Invalid
        content = bytearray()
        while chunk := os.read(fd, 131072):
            content.extend(chunk)
        os.lseek(fd, 0, os.SEEK_SET)
        return [{"mode": stat.S_IMODE(info.st_mode), "path": path, "sha256": hashlib.sha256(content).hexdigest(), "size": info.st_size, "type": "file"}]
    if not stat.S_ISDIR(info.st_mode) or not readable(info, True):
        raise Invalid
    result: list[dict[str, object]] = [{"mode": stat.S_IMODE(info.st_mode), "path": path, "sha256": None, "size": info.st_size, "type": "directory"}]
    try:
        names = sorted(os.listdir(fd), key=os.fsencode)
    except OSError as error:
        raise Invalid from error
    for name in names:
        try:
            info = os.stat(name, dir_fd=fd, follow_symlinks=False)
        except OSError as error:
            raise Invalid from error
        if not (stat.S_ISREG(info.st_mode) or stat.S_ISDIR(info.st_mode)):
            raise Invalid
        try:
            child_fd = os.open(name, flags(stat.S_ISDIR(info.st_mode)), dir_fd=fd)
        except OSError as error:
            raise Invalid from error
        try:
            result.extend(manifest(child_fd, name if not path else f"{path}/{name}"))
        finally:
            os.close(child_fd)
    return result


def copy_file(source_fd: int, parent_fd: int, name: str, mode: int) -> None:
    destination_fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC, mode, dir_fd=parent_fd)
    try:
        while chunk := os.read(source_fd, 131072):
            os.write(destination_fd, chunk)
        os.fchmod(destination_fd, mode)
        os.fsync(destination_fd)
        os.lseek(source_fd, 0, os.SEEK_SET)
    finally:
        os.close(destination_fd)


def copy_directory(source_fd: int, parent_fd: int, name: str, mode: int) -> None:
    os.mkdir(name, mode, dir_fd=parent_fd)
    destination_fd = os.open(name, flags(True), dir_fd=parent_fd)
    try:
        for child in sorted(os.listdir(source_fd), key=os.fsencode):
            info = os.stat(child, dir_fd=source_fd, follow_symlinks=False)
            if not (stat.S_ISREG(info.st_mode) or stat.S_ISDIR(info.st_mode)):
                raise Invalid
            try:
                child_fd = os.open(child, flags(stat.S_ISDIR(info.st_mode)), dir_fd=source_fd)
            except OSError as error:
                raise Invalid from error
            try:
                if stat.S_ISREG(info.st_mode):
                    copy_file(child_fd, destination_fd, child, stat.S_IMODE(info.st_mode))
                else:
                    copy_directory(child_fd, destination_fd, child, stat.S_IMODE(info.st_mode))
            finally:
                os.close(child_fd)
        os.fchmod(destination_fd, mode)
        os.fsync(destination_fd)
    finally:
        os.close(destination_fd)


def staged_manifest(stage_fd: int, name: str, directory: bool) -> list[dict[str, object]]:
    try:
        fd = os.open(name, flags(directory), dir_fd=stage_fd)
    except OSError as error:
        raise Race from error
    try:
        return manifest(fd)
    except (Invalid, OSError) as error:
        raise Race from error
    finally:
        os.close(fd)


def remove_tree(parent_fd: int, name: str) -> None:
    info = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    if stat.S_ISDIR(info.st_mode):
        fd = os.open(name, flags(True), dir_fd=parent_fd)
        try:
            for child in os.listdir(fd):
                remove_tree(fd, child)
        finally:
            os.close(fd)
        os.rmdir(name, dir_fd=parent_fd)
    else:
        os.unlink(name, dir_fd=parent_fd)


def create_private_directory(parent_fd: int, prefix: str) -> tuple[str, int]:
    for _ in range(100):
        name = f"{prefix}{secrets.token_hex(12)}"
        try:
            os.mkdir(name, 0o700, dir_fd=parent_fd)
            return name, os.open(name, flags(True), dir_fd=parent_fd)
        except FileExistsError:
            continue
    raise Invalid


def checkpoint(name: str) -> None:
    emit({"id": REQUEST_ID, "kind": "checkpoint", "name": name})
    try:
        message = json.loads(sys.stdin.readline())
    except json.JSONDecodeError as error:
        raise Invalid from error
    if message != {"id": REQUEST_ID, "kind": "continue"}:
        raise Invalid


def revalidate(root_fd: int, global_fd: int, global_path: str, root_id: tuple[int, int, int], global_id: tuple[int, int, int], snapshot: Selector, source_fd: int, source_id: tuple[int, int, int]) -> None:
    try:
        current = snapshot_selector(root_fd, global_path, snapshot.name)
    except Invalid as error:
        raise Race from error
    if identity(os.fstat(root_fd)) != root_id or identity(os.fstat(global_fd)) != global_id or current != snapshot or identity(os.fstat(source_fd)) != source_id:
        raise Race


def request() -> tuple[str, str]:
    global REQUEST_ID
    raw = json.loads(sys.stdin.readline())
    if set(raw) != {"globalRoot", "id", "kind", "root"} or raw.get("kind") != "snapshot" or not isinstance(raw["root"], str) or not isinstance(raw["globalRoot"], str) or not isinstance(raw["id"], str):
        raise Invalid
    REQUEST_ID = raw["id"]
    return raw["root"], raw["globalRoot"]


def run(root_path: str, global_path: str) -> dict[str, object]:
    root_fd = open_directory(root_path)
    global_fd = open_directory(global_path)
    stage_name = ""
    stage_fd = -1
    journal_name = ""
    sources: list[tuple[Selector, int, tuple[int, int, int], list[dict[str, object]]]] = []
    source_fds: list[int] = []
    try:
        root_id, global_id = identity(os.fstat(root_fd)), identity(os.fstat(global_fd))
        snapshots = [snapshot_selector(root_fd, global_path, name) for name in SELECTORS]
        stage_name, stage_fd = create_private_directory(root_fd, ".package-inputs-")
        stage_id = identity(os.fstat(stage_fd))
        inputs: list[dict[str, object]] = []
        for snapshot in snapshots:
            if snapshot.target is None:
                inputs.append({"selector": {"name": snapshot.name, "state": "absent"}})
                continue
            directory = snapshot.name in DIRECTORIES
            try:
                source_fd = os.open(snapshot.name, flags(directory), dir_fd=global_fd)
            except OSError as error:
                raise Invalid from error
            source_fds.append(source_fd)
            info, source_id = os.fstat(source_fd), identity(os.fstat(source_fd))
            if not valid_mode(info, directory):
                os.close(source_fd)
                raise Invalid
            checkpoint(f"after-source-open:{snapshot.name}")
            revalidate(root_fd, global_fd, global_path, root_id, global_id, snapshot, source_fd, source_id)
            source_manifest = manifest(source_fd)
            checkpoint(f"after-manifest:{snapshot.name}")
            revalidate(root_fd, global_fd, global_path, root_id, global_id, snapshot, source_fd, source_id)
            if directory:
                try: copy_directory(source_fd, stage_fd, snapshot.name, stat.S_IMODE(info.st_mode))
                except Invalid as error: raise Race from error
            else:
                try: copy_file(source_fd, stage_fd, snapshot.name, stat.S_IMODE(info.st_mode))
                except Invalid as error: raise Race from error
            checkpoint(f"after-copy:{snapshot.name}")
            revalidate(root_fd, global_fd, global_path, root_id, global_id, snapshot, source_fd, source_id)
            if manifest(source_fd) != source_manifest:
                raise Race
            if identity(os.fstat(stage_fd)) != stage_id:
                raise Race
            if staged_manifest(stage_fd, snapshot.name, directory) != source_manifest:
                raise Race
            sources.append((snapshot, source_fd, source_id, source_manifest))
            inputs.append({"selector": {"name": snapshot.name, "state": "present"}, "sourceManifest": source_manifest})
        for snapshot, source_fd, source_id, source_manifest in sources:
            revalidate(root_fd, global_fd, global_path, root_id, global_id, snapshot, source_fd, source_id)
            if identity(os.fstat(stage_fd)) != stage_id:
                raise Race
            if staged_manifest(stage_fd, snapshot.name, snapshot.name in DIRECTORIES) != source_manifest:
                raise Race
        journal_name, journal_fd = create_private_directory(root_fd, ".package-inputs-journal-")
        moved: list[str] = []
        installed: list[str] = []
        try:
            for snapshot in snapshots:
                if snapshot.target is not None:
                    os.rename(snapshot.name, snapshot.name, src_dir_fd=root_fd, dst_dir_fd=journal_fd)
                    moved.append(snapshot.name)
            for name in moved:
                os.rename(name, name, src_dir_fd=stage_fd, dst_dir_fd=root_fd)
                installed.append(name)
            os.fsync(root_fd)
        except OSError as error:
            for name in installed:
                remove_tree(root_fd, name)
            for name in moved:
                os.rename(name, name, src_dir_fd=journal_fd, dst_dir_fd=root_fd)
            raise Race from error
        finally:
            os.close(journal_fd)
        remove_tree(root_fd, journal_name)
        return {"globalIdentity": {"dev": global_id[0], "ino": global_id[1]}, "inputs": inputs, "rootIdentity": {"dev": root_id[0], "ino": root_id[1]}, "status": "approved"}
    finally:
        for source_fd in source_fds:
            os.close(source_fd)
        if stage_fd >= 0:
            os.close(stage_fd)
        if stage_name:
            try:
                remove_tree(root_fd, stage_name)
            except (FileNotFoundError, OSError):
                pass
        if journal_name:
            try:
                remove_tree(root_fd, journal_name)
            except (FileNotFoundError, OSError):
                pass
        os.close(global_fd)
        os.close(root_fd)


def main() -> None:
    try:
        root_path, global_path = request()
        result = run(root_path, global_path)
    except Race:
        result = {"code": "PACKAGE_INPUT_RACE", "status": "rejected"}
    except (Invalid, OSError, json.JSONDecodeError, KeyError, TypeError):
        result = {"code": "PACKAGE_INPUT_INVALID", "status": "rejected"}
    emit({"id": REQUEST_ID, "kind": "result", "result": result})


if __name__ == "__main__":
    main()
