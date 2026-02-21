export async function blobToHash(blob: Blob) {
  const arrayBuffer: ArrayBuffer = await blob.arrayBuffer();

  const hashBuffer: ArrayBuffer = await crypto.subtle.digest(
    "SHA-256",
    arrayBuffer
  );

  const hashArray: number[] = Array.from(new Uint8Array(hashBuffer));
  const hashHex: string = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hashHex;
}
