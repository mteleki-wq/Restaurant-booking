/* =====================================================================
   Webescapade Site Builder — email template (shared).
   The same file runs in the editor (live preview) and in the builder-email
   function (what is actually sent), so the preview is always the real email.
   Content v2: { v:2, look, accent, preheader, eyebrow, hero, headline, intro,
     button_text, button_url, sections:[…], signoff }
   Section types: pictext {img,title,text,side,btn_text,btn_url}
                  gallery {imgs[2-3],caption}
                  cards {title,items:[{img,title,text}] (2-3)}
                  text {title,text}
                  highlight {title,text,btn_text,btn_url}
                  button {text,url}
   ===================================================================== */
const WBMail = (() => {
  const LOOKS = {
    site: { label: 'Your website', bg: '#f3f2f7', card: '#ffffff', ink: '#17142b', text: '#2f2d3a', muted: '#6b6880', soft: '#f5f3fa', line: '#ebe8f2', accent: '#5b4bd6', head: 'Arial,Helvetica,sans-serif' },
    cream: { label: 'Cream & terracotta', bg: '#f3ece2', card: '#fffaf3', ink: '#3a2a20', text: '#4a3a30', muted: '#8a7768', soft: '#f5e8da', line: '#eadccb', accent: '#b4583a', head: 'Georgia,Times,serif' },
    olive: { label: 'Olive', bg: '#edefe4', card: '#fbfcf6', ink: '#2c311d', text: '#3b402c', muted: '#737862', soft: '#e7ebd7', line: '#dfe3cd', accent: '#5f6b2f', head: 'Georgia,Times,serif' },
    sage: { label: 'Soft sage', bg: '#edf3ef', card: '#ffffff', ink: '#24352c', text: '#33453b', muted: '#6c7f74', soft: '#e4efe8', line: '#dbe7df', accent: '#5f8f76', head: 'Georgia,Times,serif' },
    midnight: { label: 'Midnight & gold', bg: '#0e1120', card: '#171b2d', ink: '#ffffff', text: '#d5d8e6', muted: '#959bb3', soft: '#21263d', line: '#2a3049', accent: '#c9a45c', head: 'Georgia,Times,serif' },
  };
  const TYPES = { pictext: 'Picture + text', gallery: 'Photo row', cards: 'Highlights', text: 'Text', highlight: 'Offer box', button: 'Button' };
  const MAXSEC = 8;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const txt = (v, n) => String(v == null ? '' : v).replace(/\r/g, '').slice(0, n);
  const okImg = (u) => /^https:\/\/[^\s"'<>]+$/i.test(String(u || ''));
  const okUrl = (u) => /^https:\/\/[^\s"'<>]+$/i.test(String(u || '')) || /^(mailto:|tel:)[^\s"'<>]+$/i.test(String(u || ''));
  const hex = (h) => /^#[0-9a-f]{6}$/i.test(h || '');
  const onAccent = (h) => { const n = parseInt(h.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) > 170 ? '#17142b' : '#ffffff'; };

  // accepts v1 ({message,image,button_*}) or v2 content; returns safe v2
  function clean(c) {
    c = c || {};
    const out = { v: 2, look: LOOKS[c.look] ? c.look : 'site', accent: hex(c.accent) ? c.accent : '#5b4bd6', preheader: txt(c.preheader, 160), eyebrow: txt(c.eyebrow, 60),
      hero: okImg(c.hero) ? c.hero : (okImg(c.image) ? c.image : ''), headline: txt(c.headline, 140), intro: txt(c.intro != null ? c.intro : c.message, 4000),
      button_text: txt(c.button_text, 50), button_url: okUrl(c.button_url) ? String(c.button_url) : '', signoff: txt(c.signoff, 300), sections: [] };
    (Array.isArray(c.sections) ? c.sections : []).slice(0, MAXSEC).forEach((s) => {
      if (!s || !TYPES[s.t]) return;
      const b = { t: s.t };
      if (s.t === 'pictext') Object.assign(b, { img: okImg(s.img) ? s.img : '', title: txt(s.title, 120), text: txt(s.text, 1500), side: s.side === 'right' ? 'right' : 'left', btn_text: txt(s.btn_text, 40), btn_url: okUrl(s.btn_url) ? s.btn_url : '' });
      if (s.t === 'gallery') Object.assign(b, { imgs: (Array.isArray(s.imgs) ? s.imgs : []).filter(okImg).slice(0, 3), caption: txt(s.caption, 200) });
      if (s.t === 'cards') Object.assign(b, { title: txt(s.title, 120), items: (Array.isArray(s.items) ? s.items : []).slice(0, 3).map((i) => ({ img: okImg(i && i.img) ? i.img : '', title: txt(i && i.title, 60), text: txt(i && i.text, 300) })) });
      if (s.t === 'text') Object.assign(b, { title: txt(s.title, 120), text: txt(s.text, 3000) });
      if (s.t === 'highlight') Object.assign(b, { title: txt(s.title, 120), text: txt(s.text, 800), btn_text: txt(s.btn_text, 40), btn_url: okUrl(s.btn_url) ? s.btn_url : '' });
      if (s.t === 'button') Object.assign(b, { text: txt(s.text, 50), url: okUrl(s.url) ? s.url : '' });
      out.sections.push(b);
    });
    return out;
  }

  // anything with text the reader would see — used to stop empty sends
  function hasBody(c) { return !!(c.headline.trim() || c.intro.trim() || c.sections.length); }
  // [square bracket] notes left in from an idea
  function blanks(c) {
    const all = [c.headline, c.intro, c.preheader, c.signoff, c.button_text].concat(c.sections.map((s) => [s.title, s.text, s.caption, s.btn_text].concat((s.items || []).map((i) => i.title + ' ' + i.text)).map((x) => x || '').join(' '))).join(' ');
    return (all.match(/\[[^\]\n]{2,60}\]/g) || []).filter((v, i, a) => a.indexOf(v) === i);
  }

  function render(raw, biz, first, unsub) {
    const c = clean(raw), L = Object.assign({}, LOOKS[c.look]);
    if (c.look === 'site') L.accent = c.accent;
    const A = L.accent, AT = onAccent(A), F = 'Arial,Helvetica,sans-serif';
    const fill = (t) => esc(t).replace(/\{first_name\}/g, esc(first || 'there'));
    const paras = (t, size) => String(t || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
      .map((p) => '<p style="margin:0 0 14px;font:' + (size || 16) + 'px/1.6 ' + F + ';color:' + L.text + '">' + fill(p).replace(/\n/g, '<br>') + '</p>').join('');
    const h2 = (t, center) => t ? '<h2 style="margin:0 0 10px;font:bold 22px/1.25 ' + L.head + ';color:' + L.ink + (center ? ';text-align:center' : '') + '">' + fill(t) + '</h2>' : '';
    const btn = (t, u, center) => t && u ? '<table role="presentation" cellpadding="0" cellspacing="0"' + (center ? ' align="center"' : '') + ' style="margin:6px ' + (center ? 'auto' : '0') + ' 4px"><tr><td style="border-radius:999px;background:' + A + '"><a href="' + esc(u) + '" style="display:inline-block;padding:13px 26px;font:bold 15px ' + F + ';color:' + AT + ';text-decoration:none;border-radius:999px">' + esc(t) + '</a></td></tr></table>' : '';
    const img = (u, r) => '<img src="' + esc(u) + '" alt="" width="100%" style="display:block;width:100%;height:auto;border:0;border-radius:' + (r == null ? 12 : r) + 'px">';
    const row = (inner, pad) => '<tr><td class="wbm-pad" style="padding:' + (pad || '0 32px 26px') + '">' + inner + '</td></tr>';

    const secs = c.sections.map((s) => {
      if (s.t === 'text') return row(h2(s.title) + paras(s.text));
      if (s.t === 'button') return row(btn(s.text, s.url, true));
      if (s.t === 'highlight') return row('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + L.soft + ';border-radius:14px;border-left:5px solid ' + A + '"><tr><td style="padding:22px 24px">' + h2(s.title) + paras(s.text, 15) + btn(s.btn_text, s.btn_url) + '</td></tr></table>');
      if (s.t === 'gallery') {
        const n = s.imgs.length; if (!n) return '';
        const w = n === 1 ? 100 : n === 2 ? 50 : 33;
        return row('<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' + s.imgs.map((u, i) => '<td width="' + w + '%" valign="top" style="padding:0 ' + (i < n - 1 ? 4 : 0) + 'px 0 ' + (i ? 4 : 0) + 'px">' + img(u, 10) + '</td>').join('') + '</tr></table>' +
          (s.caption ? '<p style="margin:10px 0 0;font:italic 14px/1.5 ' + F + ';color:' + L.muted + ';text-align:center">' + fill(s.caption) + '</p>' : ''));
      }
      if (s.t === 'cards') {
        const it = s.items.filter((i) => i.title || i.text || i.img); if (!it.length) return '';
        const w = it.length === 1 ? 100 : it.length === 2 ? 50 : 33;
        return row(h2(s.title, true) + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' + it.map((i, k) => '<td class="wbm-col" width="' + w + '%" valign="top" style="padding:8px ' + (k < it.length - 1 ? 6 : 0) + 'px 0 ' + (k ? 6 : 0) + 'px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + L.soft + ';border-radius:12px"><tr><td style="padding:' + (i.img ? '0' : '16px 16px 4px') + '">' + (i.img ? img(i.img, 12) : '') + '</td></tr><tr><td style="padding:' + (i.img ? '14px' : '0') + ' 16px 16px">' +
          (i.title ? '<p style="margin:0 0 6px;font:bold 16px/1.3 ' + L.head + ';color:' + L.ink + '">' + fill(i.title) + '</p>' : '') + (i.text ? '<p style="margin:0;font:14px/1.5 ' + F + ';color:' + L.text + '">' + fill(i.text).replace(/\n/g, '<br>') + '</p>' : '') + '</td></tr></table></td>').join('') + '</tr></table>');
      }
      if (s.t === 'pictext') {
        const words = h2(s.title) + paras(s.text, 15) + btn(s.btn_text, s.btn_url);
        if (!s.img) return row(words);
        const pic = '<td class="wbm-col" width="48%" valign="middle" style="padding:0">' + img(s.img, 12) + '</td>';
        const gap = '<td class="wbm-gap" width="4%" style="font-size:0">&nbsp;</td>';
        const tx = '<td class="wbm-col" width="48%" valign="middle" style="padding:0">' + words + '</td>';
        return row('<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' + (s.side === 'right' ? tx + gap + pic : pic + gap + tx) + '</tr></table>');
      }
      return '';
    }).join('');

    const site = biz.site || '';
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>' + esc(raw && raw.subject || '') + '</title>' +
      '<style>@media (max-width:540px){.wbm-col{display:block!important;width:100%!important;padding:0 0 12px!important}.wbm-gap{display:none!important}.wbm-pad{padding-left:20px!important;padding-right:20px!important}h1{font-size:26px!important}}</style></head>' +
      '<body style="margin:0;padding:0;background:' + L.bg + '">' +
      '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' + esc(c.preheader) + '&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + L.bg + '"><tr><td align="center" style="padding:24px 10px">' +
      '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:' + L.card + ';border-radius:18px;overflow:hidden">' +
      '<tr><td style="padding:20px 32px;font:bold 19px ' + L.head + ';color:' + L.ink + ';border-bottom:1px solid ' + L.line + '"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + A + ';margin-right:10px"></span>' + esc(biz.name) + '</td></tr>' +
      (c.hero ? '<tr><td>' + img(c.hero, 0) + '</td></tr>' : '') +
      '<tr><td class="wbm-pad" style="padding:30px 32px 10px">' +
      (c.eyebrow ? '<p style="margin:0 0 8px;font:bold 12px ' + F + ';letter-spacing:2px;text-transform:uppercase;color:' + A + '">' + fill(c.eyebrow) + '</p>' : '') +
      (c.headline ? '<h1 style="margin:0 0 16px;font:bold 30px/1.18 ' + L.head + ';color:' + L.ink + '">' + fill(c.headline) + '</h1>' : '') +
      paras(c.intro) + btn(c.button_text, c.button_url) + '</td></tr>' +
      (secs ? '<tr><td style="padding:10px 0 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + secs + '</table></td></tr>' : '') +
      (c.signoff ? '<tr><td class="wbm-pad" style="padding:0 32px 28px">' + paras(c.signoff, 15) + '</td></tr>' : '<tr><td style="height:8px"></td></tr>') +
      '<tr><td style="padding:20px 32px 26px;background:' + L.soft + ';font:13px/1.6 ' + F + ';color:' + L.muted + '"><b style="color:' + L.ink + '">' + esc(biz.name) + '</b>' +
      (site ? ' · <a href="' + esc(site) + '" style="color:' + L.muted + '">' + esc(site.replace(/^https:\/\//, '')) + '</a>' : '') +
      '<br>You are receiving this because you asked to hear from ' + esc(biz.name) + '. Reply to this email to contact us.<br>' +
      '<a href="' + esc(unsub || '#') + '" style="color:' + L.muted + '">Unsubscribe</a></td></tr>' +
      '</table></td></tr></table></body></html>';
  }

  return { LOOKS, TYPES, MAXSEC, clean, render, hasBody, blanks, okImg, okUrl };
})();
if (typeof window !== 'undefined') window.WBMail = WBMail;
export default WBMail;
