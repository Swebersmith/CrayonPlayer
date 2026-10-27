import { playbackLink } from './demo-entry';

const escapeAttribute = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

export function integrationExamples(href: string, source: string, hosted: boolean, parser = '') {
  const base = new URL(hosted ? '/parse' : './', href);
  if (parser) base.searchParams.set('parser', parser);
  const link = playbackLink(href, source, hosted, parser);
  const embedded = new URL(link);
  embedded.searchParams.set('embed', '1');
  return {
    prefix: base.href + (base.search ? '&url=' : '?url='),
    link,
    iframe: `<iframe\n  src="${escapeAttribute(embedded.href)}"\n  style="width:100%;aspect-ratio:16/9;border:0"\n  title="Crayon Player" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen>\n</iframe>`,
  };
}

export function setupIntegrationGuide(href: string, hosted: boolean, source: () => string, parser: () => string = () => '') {
  const dialog = document.querySelector<HTMLDialogElement>('#integration-guide')!;
  const input = document.querySelector<HTMLInputElement>('#integration-source')!;
  const feedback = document.querySelector<HTMLDivElement>('#integration-feedback')!;
  const fields = ['prefix', 'link', 'iframe'] as const;
  const output = (name: string) => document.querySelector<HTMLTextAreaElement>('#integration-' + name)!;
  if (!hosted) document.querySelector('#integration-auth')!.textContent = '当前为纯静态部署，未启用本项目的密码登录服务；若托管平台另设访问验证，请遵循平台要求。';

  const update = () => {
    try {
      const examples = integrationExamples(href, input.value, hosted, parser());
      fields.forEach(name => { output(name).value = examples[name]; });
      feedback.textContent = '';
      dialog.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach(button => { button.disabled = false; });
    } catch (error) {
      fields.forEach(name => { output(name).value = ''; });
      dialog.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach(button => { button.disabled = true; });
      feedback.textContent = (error as Error).message;
    }
  };
  document.querySelector('#show-integration')!.addEventListener('click', () => {
    input.value = source();
    update();
    dialog.showModal();
  });
  input.addEventListener('input', update);
  dialog.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach(button => {
    button.addEventListener('click', async () => {
      const field = document.getElementById(button.dataset.copy!) as HTMLTextAreaElement;
      try {
        await navigator.clipboard.writeText(field.value);
        feedback.textContent = '已复制。';
      } catch {
        field.focus();
        field.select();
        feedback.textContent = '已选中内容，请长按或按 Ctrl/Cmd+C 复制。';
      }
    });
  });
}
