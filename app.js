(() => {
  const status = document.querySelector('#copy-status');

  const copyText = async (text) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const helper = document.createElement('textarea');
    helper.value = text;
    helper.setAttribute('readonly', '');
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.append(helper);
    helper.select();

    if (!document.execCommand('copy')) {
      document.body.removeChild(helper);
      throw new Error('Copy was not available');
    }

    document.body.removeChild(helper);
  };

  document.querySelectorAll('[data-copy-target]').forEach((button) => {
    button.addEventListener('click', async () => {
      const target = document.getElementById(button.dataset.copyTarget);
      if (!target) return;

      const originalLabel = button.textContent;
      button.disabled = true;

      try {
        await copyText(target.textContent);
        button.textContent = 'Copied';
        button.dataset.state = 'copied';
        status.textContent = `${button.getAttribute('aria-label')} copied.`;
      } catch {
        button.textContent = 'Copy failed';
        button.dataset.state = 'error';
        status.textContent = 'Copy failed. Select the command text and copy it manually.';
      }

      window.setTimeout(() => {
        button.textContent = originalLabel;
        delete button.dataset.state;
        button.disabled = false;
      }, 1800);
    });
  });
})();
