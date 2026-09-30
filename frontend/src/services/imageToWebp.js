// Gör om en vald bild till en kvadratisk WebP-profilbild direkt i webbläsaren.
// Mittdelen beskärs till en kvadrat och skalas ner till högst `size` pixlar.
// Resultatet blir oftast 20–60 KB i stället för flera MB, och eftersom bilden
// ritas om från grunden följer ingen EXIF-data (t.ex. GPS-position) med.
export async function imageToWebp(file, size = 512, quality = 0.85) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Filen är ingen bild.')
  }

  let bitmap
  try {
    // Roterar automatiskt rätt för mobilbilder som sparats liggande.
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('Bilden kunde inte läsas. Prova en JPEG- eller PNG-bild.')
  }

  const side = Math.min(bitmap.width, bitmap.height)
  const out = Math.min(size, side)
  const canvas = document.createElement('canvas')
  canvas.width = out
  canvas.height = out
  canvas
    .getContext('2d')
    .drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, out, out)
  bitmap.close()

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality))
  // Webbläsare som inte kan skapa WebP ger tyst en PNG i stället.
  if (!blob || blob.type !== 'image/webp') {
    throw new Error('Din webbläsare kan inte skapa WebP-bilder. Prova en nyare version.')
  }
  return blob
}
