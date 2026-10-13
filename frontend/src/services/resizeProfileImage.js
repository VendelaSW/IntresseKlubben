// Gör om en vald bild till en kvadratisk profilbild direkt i webbläsaren.
// Mittdelen beskärs till en kvadrat och skalas ner till högst `size` pixlar.
// Resultatet blir oftast 20–60 KB i stället för flera MB, och eftersom bilden
// ritas om från grunden följer ingen EXIF-data (t.ex. GPS-position) med.
//
// Bilden blir WebP. Safari kan visa WebP men inte skapa det (och alla
// webbläsare på iPhone bygger på Safari), så där blir den JPEG i stället.
// Backend tar emot båda (se storage.IMAGE_TYPES).
export async function resizeProfileImage(file, size = 512, quality = 0.85) {
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
  const context = canvas.getContext('2d')
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, out, out)
  bitmap.close()

  // En webbläsare som inte kan skapa den begärda typen ger tyst en PNG i stället.
  const webp = await toBlob(canvas, 'image/webp', quality)
  if (webp?.type === 'image/webp') return webp

  // JPEG kan inte vara genomskinlig: lägg vitt bakom, annars blir det svart.
  context.globalCompositeOperation = 'destination-over'
  context.fillStyle = '#fff'
  context.fillRect(0, 0, out, out)
  const jpeg = await toBlob(canvas, 'image/jpeg', quality)
  if (jpeg?.type === 'image/jpeg') return jpeg

  throw new Error('Bilden kunde inte göras om. Prova en annan bild.')
}

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality))
