import { PrismaClient } from "@prisma/client";
import { fetchWikibooksSnippet } from "../api/wikibooks";

export const prisma = new PrismaClient();

export async function getOrCreatePosition(fen: string, openingMetadata?: { eco: string, name: string }, history?: string[]) {
  const strippedFen = fen.split(" ").slice(0, 4).join(" ");
  let pos = await prisma.position.findUnique({ where: { fen: strippedFen } });
  
  if (!pos) { 
    let wikiText = null;
    if (history && history.length > 0) {
       wikiText = await fetchWikibooksSnippet(history);
    }
    pos = await prisma.position.create({ 
      data: { 
        fen: strippedFen,
        eco: openingMetadata?.eco || null,
        openingName: openingMetadata?.name || null,
        wikiText: wikiText
      } 
    }); 
  } else if (openingMetadata && openingMetadata.name && !pos.openingName) {
    let wikiText = pos.wikiText;
    if (!wikiText && history && history.length > 0) {
       wikiText = await fetchWikibooksSnippet(history);
    }
    
    pos = await prisma.position.update({
      where: { id: pos.id },
      data: {
        eco: openingMetadata.eco,
        openingName: openingMetadata.name,
        wikiText: wikiText
      }
    });
  }
  return pos;
}
