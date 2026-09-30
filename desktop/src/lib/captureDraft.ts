/** Compose the capture fields into the source Markdown consumed by the engine. */
export const captureMarkdown = (title: string, body: string): string => {
  const heading = title.trim().replace(/[\r\n]+/g, ' ');
  const content = body.trim();
  if (!heading) return content;
  return content ? `# ${heading}\n\n${content}` : `# ${heading}`;
};
