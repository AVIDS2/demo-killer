import { prisma } from "../../../../lib/db";

export async function DELETE(request: Request) {
  const { userId } = await request.json();
  await prisma.user.delete({ where: { id: userId } });
  return Response.json({ ok: true });
}
