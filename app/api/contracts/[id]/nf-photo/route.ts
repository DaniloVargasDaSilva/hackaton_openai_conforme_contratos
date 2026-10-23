// Dan: POST /api/contracts/:id/nf-photo (foto da NF lida pela IA). Mesma resposta do upload do XML.
import { z } from "zod";
import { uploadNfPhoto } from "@/lib/server/service";
import { ok, parseBody, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";
// A leitura da imagem chama a OpenAI (até 40 s) antes de gravar.
export const maxDuration = 60;

const NfPhotoBody = z.object({
  // base64 puro, sem o prefixo "data:...". A Vercel recusa corpos acima de 4,5 MB antes de chegar aqui.
  imageBase64: z.string().min(100, "imagem vazia").max(6_000_000, "imagem grande demais: reduza para até uns 4 MB"),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"], {
    errorMap: () => ({ message: "formato de imagem não suportado (use JPEG, PNG ou WebP)" }),
  }),
});

export const POST = route<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const body = await parseBody(req, NfPhotoBody);
  return ok(await uploadNfPhoto(id, body.imageBase64, body.mimeType));
});
