import { auth } from "@/auth";
import { prisma } from "../../../../lib/db";

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.role || session.user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  const { userId } = await request.json();
  await prisma.user.delete({ where: { id: userId } });
  return Response.json({ ok: true });
}
