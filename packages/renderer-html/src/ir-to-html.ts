import type { BlockNode, DocumentIR, InlineNode, NotebookOutputNode } from "@docgraph/core-types";
import { escapeHtml, sanitizeHtmlFragment } from "@docgraph/security";

function renderInline(nodes: readonly InlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.kind) {
        case "text":
          return escapeHtml(node.value);
        case "emphasis":
          return `<em>${renderInline(node.children)}</em>`;
        case "strong":
          return `<strong>${renderInline(node.children)}</strong>`;
        case "strikethrough":
          return `<del>${renderInline(node.children)}</del>`;
        case "inline-code":
          return `<code>${escapeHtml(node.value)}</code>`;
        case "link":
          return `<a href="${escapeHtml(node.href)}">${renderInline(node.children)}</a>`;
        case "image":
          return `<img src="${escapeHtml(node.src)}" alt="${escapeHtml(node.alt ?? "")}" />`;
        case "math-inline":
          return `<code class="dg-math-inline">${escapeHtml(node.value)}</code>`;
        case "footnote-ref":
          return `<sup>${escapeHtml(node.label ?? node.identifier)}</sup>`;
        case "break":
          return "<br />";
        case "html-span":
          return `<span class="dg-html-span">${escapeHtml(sanitizeHtmlFragment(node.value))}</span>`;
        case "superscript":
          return `<sup>${renderInline(node.children)}</sup>`;
        case "subscript":
          return `<sub>${renderInline(node.children)}</sub>`;
        case "highlight":
          return `<mark>${renderInline(node.children)}</mark>`;
      }
    })
    .join("");
}

function renderNotebookOutputs(outputs: readonly NotebookOutputNode[] | undefined): string {
  if (!outputs || outputs.length === 0) {
    return "";
  }

  return outputs
    .map((output) => {
      switch (output.outputType) {
        case "image/png":
        case "image/jpeg":
          return `<img class="dg-notebook-image" src="data:${output.outputType};base64,${output.data ?? ""}" alt="Notebook output" />`;
        case "text/html":
          return `<div class="dg-notebook-html">${sanitizeHtmlFragment(output.text ?? "")}</div>`;
        case "application/json":
          return `<pre class="dg-notebook-json">${escapeHtml(JSON.stringify(output.structured, null, 2))}</pre>`;
        case "error":
          return `<pre class="dg-notebook-error">${escapeHtml(
            [output.ename, output.evalue, ...(output.traceback ?? [])].filter(Boolean).join("\n")
          )}</pre>`;
        default:
          return `<pre class="dg-notebook-text">${escapeHtml(output.text ?? "")}</pre>`;
      }
    })
    .join("");
}

function renderBlock(node: BlockNode): string {
  switch (node.kind) {
    case "heading":
      return `<h${node.level} id="${escapeHtml(node.slug)}">${renderInline(node.children)}</h${node.level}>`;
    case "paragraph":
      return `<p>${renderInline(node.children)}</p>`;
    case "list": {
      const tag = node.ordered ? "ol" : "ul";
      const start = node.ordered && node.start ? ` start="${node.start}"` : "";
      return `<${tag}${start}>${node.items
        .map((item) => `<li>${item.children.map(renderBlock).join("")}</li>`)
        .join("")}</${tag}>`;
    }
    case "list-item":
      return node.children.map(renderBlock).join("");
    case "table":
      return `<table><thead>${node.header
        .map(
          (row) =>
            `<tr>${row.cells
              .map((cell) => `<th>${renderInline(cell.children)}</th>`)
              .join("")}</tr>`
        )
        .join("")}</thead><tbody>${node.body
        .map(
          (row) =>
            `<tr>${row.cells
              .map((cell) => `<td>${renderInline(cell.children)}</td>`)
              .join("")}</tr>`
        )
        .join("")}</tbody></table>`;
    case "code-block":
      return `<pre class="dg-code-block"><code data-language="${escapeHtml(node.language ?? "")}">${escapeHtml(node.value)}</code></pre>`;
    case "math-block":
      return `<pre class="dg-math-block">${escapeHtml(node.value)}</pre>`;
    case "quote":
      return `<blockquote>${node.children.map(renderBlock).join("")}</blockquote>`;
    case "callout":
      return `<aside class="dg-callout dg-callout-${escapeHtml(node.calloutType)}">${
        node.title ? `<div class="dg-callout-title">${renderInline(node.title)}</div>` : ""
      }${node.children.map(renderBlock).join("")}</aside>`;
    case "thematic-break":
      return "<hr />";
    case "media-block":
      return `<figure class="dg-media"><img src="${escapeHtml(node.src)}" alt="${escapeHtml(node.alt ?? "")}" />${
        node.title ? `<figcaption>${escapeHtml(node.title)}</figcaption>` : ""
      }</figure>`;
    case "form":
      return `<section class="dg-form">${node.fields
        .map((field) => `<div class="dg-form-field">${escapeHtml(field.label ?? field.name)}</div>`)
        .join("")}</section>`;
    case "notebook-cell":
      return `<section class="dg-notebook-cell"><header class="dg-notebook-cell-header">${escapeHtml(
        node.cellType
      )}${node.executionCount !== undefined && node.executionCount !== null ? ` · ${node.executionCount}` : ""}</header>${
        node.children && node.children.length > 0
          ? node.children.map(renderBlock).join("")
          : `<pre class="dg-code-block"><code>${escapeHtml(node.source)}</code></pre>`
      }${renderNotebookOutputs(node.outputs)}</section>`;
    case "raw-embed":
      return `<details class="dg-raw-embed"><summary>${escapeHtml(node.reason)}</summary><pre>${escapeHtml(
        node.rawBinary ?? node.raw
      )}</pre></details>`;
    case "component-embed":
      return `<section class="dg-component-embed"><header>&lt;${escapeHtml(node.componentName)} /&gt;</header><pre>${escapeHtml(
        JSON.stringify(node.props, null, 2)
      )}</pre>${node.children?.map(renderBlock).join("") ?? ""}</section>`;
    case "definition-list":
      return `<dl>${node.items
        .map(
          (item) =>
            `<dt>${renderInline(item.term)}</dt>${item.definitions
              .map((definition) => `<dd>${definition.map(renderBlock).join("")}</dd>`)
              .join("")}`
        )
        .join("")}</dl>`;
    case "footnote-def":
      return `<section class="dg-footnote"><sup>${escapeHtml(node.label ?? node.identifier)}</sup>${node.children
        .map(renderBlock)
        .join("")}</section>`;
  }
}

export function renderHtml(ir: DocumentIR): string {
  return `<article class="dg-doc"><header class="dg-doc-header"><p class="dg-doc-kicker">${escapeHtml(
    ir.provenance.sourceFormat
  )}</p><h1>${escapeHtml(ir.title ?? "Untitled Document")}</h1></header>${ir.blocks.map(renderBlock).join("")}</article>`;
}
