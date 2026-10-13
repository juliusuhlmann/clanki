<script lang="ts">
  // A card text field that takes images: paste, drop or pick one. Images show as short
  // placeholders (`![](image-1)`) with thumbnails underneath; `value` always holds the full text.
  import { untrack } from 'svelte';
  import { ImageSlots, compressImage } from '../lib/imageSlots';

  let {
    value = $bindable(''),
    ref = $bindable(),
    rows = 2,
    placeholder = '',
    autofocus = false,
    onkeydown,
  }: {
    value: string;
    ref?: HTMLTextAreaElement;
    rows?: number;
    placeholder?: string;
    autofocus?: boolean;
    onkeydown?: (e: KeyboardEvent) => void;
  } = $props();

  const slots = new ImageSlots();
  let shown = $state(untrack(() => slots.collapse(value)));
  let busy = $state(false);
  let picker: HTMLInputElement;

  // Outside changes to `value` (e.g. cleared after adding a card) reach the field.
  $effect(() => {
    const v = value;
    untrack(() => {
      if (slots.expand(shown) !== v) shown = slots.collapse(v);
    });
  });

  function setShown(text: string) {
    shown = text;
    value = slots.expand(text);
  }

  const thumbs = $derived(slots.used(shown));

  const isImage = (f: File) => f.type.startsWith('image/');

  async function insertImages(files: Iterable<File>) {
    const images = [...files].filter(isImage);
    if (!images.length || !ref) return;
    busy = true;
    try {
      let text = '';
      for (const file of images) text += `![](${slots.slot(await compressImage(file))})`;
      const start = ref.selectionStart ?? shown.length;
      const end = ref.selectionEnd ?? start;
      setShown(shown.slice(0, start) + text + shown.slice(end));
      const caret = start + text.length;
      requestAnimationFrame(() => {
        ref?.focus();
        ref?.setSelectionRange(caret, caret);
      });
    } finally {
      busy = false;
    }
  }

  function takeImages(e: Event, files: FileList | undefined) {
    if (!files || ![...files].some(isImage)) return;
    e.preventDefault();
    void insertImages(files);
  }

  function onpick() {
    if (picker.files) void insertImages(picker.files);
    picker.value = '';
  }
</script>

<div class="card-textarea">
  <!-- svelte-ignore a11y_autofocus -->
  <textarea
    bind:this={ref}
    value={shown}
    oninput={(e) => setShown(e.currentTarget.value)}
    onpaste={(e) => takeImages(e, e.clipboardData?.files)}
    ondrop={(e) => takeImages(e, e.dataTransfer?.files)}
    {rows}
    {placeholder}
    {onkeydown}
    {autofocus}
  ></textarea>
  <div class="image-row">
    {#each thumbs as t (t.slot)}
      <figure class="image-thumb"><img src={t.src} alt="" /><figcaption>{t.slot}</figcaption></figure>
    {/each}
    <button class="btn ghost small" type="button" disabled={busy} onclick={() => picker.click()} title="Add image (or paste / drop one)">
      {busy ? 'Adding…' : '+ Image'}
    </button>
    <input bind:this={picker} type="file" accept="image/*" multiple hidden onchange={onpick} />
  </div>
</div>
