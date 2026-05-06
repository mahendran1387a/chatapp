export const maxRequestBodyBytes = Number(process.env.MAX_CHAT_BODY_MB ?? 25) * 1024 * 1024;

export async function readRequestBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    chunks.push(chunk);
    size += chunk.length;
    if (size > maxRequestBodyBytes) {
      const error = new Error('Request body too large');
      error.statusCode = 413;
      throw error;
    }
  }

  return Buffer.concat(chunks).toString('utf8');
}
