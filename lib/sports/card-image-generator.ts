/**
 * SmartBetBot High-Resolution Canvas Card Image Generator
 * Generates branded visual betting tickets for 1-click sharing to WhatsApp and Telegram.
 */

import { MarketOpportunity } from "./prediction-engine";

export async function generatePredictionCardBlob(prediction: MarketOpportunity): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const width = 800;
  const height = 540;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");

  // Background Gradient
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, "#080c14");
  bgGrad.addColorStop(0.5, "#0d1527");
  bgGrad.addColorStop(1, "#080c14");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Outer Border with Glow
  ctx.strokeStyle = "rgba(16, 185, 129, 0.4)";
  ctx.lineWidth = 4;
  ctx.strokeRect(16, 16, width - 32, height - 32);

  // Top Header Banner
  ctx.fillStyle = "rgba(16, 185, 129, 0.12)";
  ctx.fillRect(20, 20, width - 40, 70);

  // SmartBetBot Logo / Title
  ctx.fillStyle = "#10b981";
  ctx.font = "900 24px system-ui, -apple-system, sans-serif";
  ctx.fillText("⚽ SMARTBETBOT AI", 40, 62);

  // Date / Time Kickoff
  const kickoffFormatted = new Date(prediction.kickoff).toLocaleString("es-ES", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 15px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`📅 ${kickoffFormatted} (Ecuador UTC-5)`, width - 40, 62);
  ctx.textAlign = "left";

  // League & Country Pill
  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  ctx.beginPath();
  ctx.roundRect(40, 110, 400, 34, 12);
  ctx.fill();
  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 15px system-ui, -apple-system, sans-serif";
  ctx.fillText(`🏆 ${prediction.league} ${prediction.country ? `• ${prediction.country}` : ""}`, 54, 133);

  // Badge Pill (Bomba, Valor, or Confidence)
  let badgeText = prediction.confidence === "Muy Alta" ? "⭐⭐⭐ MUY ALTA (85%+)" : prediction.confidence === "Alta" ? "⭐⭐ ALTA SEGURIDAD" : "⭐ MEDIA";
  let badgeBg = "rgba(16, 185, 129, 0.25)";
  let badgeColor = "#34d399";

  if (prediction.pickBadge === "bomba") {
    badgeText = "💣 BOMBA (ALTA CUOTA)";
    badgeBg = "rgba(249, 115, 22, 0.35)";
    badgeColor = "#fb923c";
  } else if (prediction.pickBadge === "valor") {
    badgeText = "💎 VALOR (MÁXIMA CERTEZA)";
    badgeBg = "rgba(16, 185, 129, 0.35)";
    badgeColor = "#10b981";
  }

  ctx.fillStyle = badgeBg;
  ctx.beginPath();
  ctx.roundRect(width - 310, 110, 270, 34, 12);
  ctx.fill();
  ctx.fillStyle = badgeColor;
  ctx.font = "900 13px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(badgeText, width - 175, 133);
  ctx.textAlign = "left";

  // Match Teams
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 30px system-ui, -apple-system, sans-serif";
  ctx.fillText(prediction.homeTeam, 40, 195);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 20px system-ui, -apple-system, sans-serif";
  ctx.fillText("vs", 40, 230);
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 30px system-ui, -apple-system, sans-serif";
  ctx.fillText(prediction.awayTeam, 40, 275);

  // Result Badge & Actual Score (if finished/settled)
  if (prediction.status === "won" || prediction.status === "lost") {
    const isWon = prediction.status === "won";
    ctx.fillStyle = isWon ? "#10b981" : "#e11d48";
    ctx.beginPath();
    ctx.roundRect(width - 200, 180, 160, 42, 14);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 16px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(isWon ? "✓ GANADO" : "✗ PERDIDO", width - 120, 207);

    if (prediction.actualScore) {
      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 14px system-ui, -apple-system, sans-serif";
      ctx.fillText(`Marcador: ${prediction.actualScore}`, width - 120, 250);
    }
    ctx.textAlign = "left";
  }

  // Main Prediction Box
  const pickBoxGrad = ctx.createLinearGradient(40, 310, width - 80, 420);
  pickBoxGrad.addColorStop(0, "rgba(16, 185, 129, 0.18)");
  pickBoxGrad.addColorStop(1, "rgba(14, 165, 233, 0.18)");
  ctx.fillStyle = pickBoxGrad;
  ctx.beginPath();
  ctx.roundRect(40, 310, width - 80, 115, 20);
  ctx.fill();
  ctx.strokeStyle = "rgba(16, 185, 129, 0.5)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#10b981";
  ctx.font = "bold 13px system-ui, -apple-system, sans-serif";
  ctx.fillText("🎯 PRONÓSTICO SMARTBETBOT", 60, 340);

  ctx.fillStyle = "#ffffff";
  ctx.font = "900 20px system-ui, -apple-system, sans-serif";
  ctx.fillText(`${prediction.market} (${prediction.selection})`, 60, 385);

  // Cuota Casa de Apuestas Badge
  ctx.fillStyle = "#0284c7";
  ctx.beginPath();
  ctx.roundRect(width - 390, 335, 115, 65, 14);
  ctx.fill();
  ctx.fillStyle = "#e0f2fe";
  ctx.font = "bold 9px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("CASA DE APUESTAS", width - 332, 355);
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 20px system-ui, -apple-system, sans-serif";
  ctx.fillText(`@${prediction.odds.toFixed(2)}`, width - 332, 385);

  // Cuota Modelo SmartBetBot Badge
  ctx.fillStyle = "#4f46e5";
  ctx.beginPath();
  ctx.roundRect(width - 265, 335, 125, 65, 14);
  ctx.fill();
  ctx.fillStyle = "#e0e7ff";
  ctx.font = "bold 9px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("MODELO SMARTBETBOT", width - 202, 355);
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 20px system-ui, -apple-system, sans-serif";
  ctx.fillText(`@${(prediction.fairOdds || 1.35).toFixed(2)}`, width - 202, 385);

  // Probabilidad Badge
  ctx.fillStyle = "#059669";
  ctx.beginPath();
  ctx.roundRect(width - 130, 335, 90, 65, 14);
  ctx.fill();
  ctx.fillStyle = "#d1fae5";
  ctx.font = "bold 9px system-ui, -apple-system, sans-serif";
  ctx.fillText("PROB. ÉLITE", width - 85, 355);
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 20px system-ui, -apple-system, sans-serif";
  ctx.fillText(`${prediction.probability}%`, width - 85, 385);
  ctx.textAlign = "left";

  // Footer Explanation / Watermark
  ctx.fillStyle = "#94a3b8";
  ctx.font = "italic 13px system-ui, -apple-system, sans-serif";
  const truncatedExpl = prediction.explanation.length > 95
    ? prediction.explanation.slice(0, 95) + "..."
    : prediction.explanation;
  ctx.fillText(`"${truncatedExpl}"`, 40, 465);

  ctx.fillStyle = "#64748b";
  ctx.font = "bold 12px system-ui, -apple-system, sans-serif";
  ctx.fillText("🌐 smartbetbot.educandotea.com • Pronósticos Deportivos de Precisión Matemática", 40, 500);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to create blob from canvas"));
    }, "image/png");
  });
}

/**
 * Copies the card image directly to the system clipboard (PNG) so it can be pasted in WhatsApp/Telegram Web with Ctrl+V.
 */
export async function copyCardImageToClipboard(prediction: MarketOpportunity): Promise<boolean> {
  try {
    const blob = await generatePredictionCardBlob(prediction);
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "image/png": blob,
        }),
      ]);
      return true;
    }
    // Fallback: download the image
    downloadCardImage(prediction, blob);
    return true;
  } catch (err) {
    console.warn("Clipboard image write failed, triggering fallback download:", err);
    try {
      const blob = await generatePredictionCardBlob(prediction);
      downloadCardImage(prediction, blob);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Downloads the card as a PNG image file
 */
export async function downloadCardImage(prediction: MarketOpportunity, existingBlob?: Blob) {
  const blob = existingBlob || (await generatePredictionCardBlob(prediction));
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `SmartBetBot-${prediction.homeTeam}-vs-${prediction.awayTeam}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Shares the card image via native Web Share API with image file if supported,
 * otherwise copies the image and opens the WhatsApp or Telegram link.
 */
export async function shareCardAsImage(
  prediction: MarketOpportunity,
  platform: "whatsapp" | "telegram"
): Promise<void> {
  const blob = await generatePredictionCardBlob(prediction);
  const file = new File(
    [blob],
    `SmartBetBot-${prediction.homeTeam}-vs-${prediction.awayTeam}.png`,
    { type: "image/png" }
  );

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        title: `🎯 Pronóstico: ${prediction.homeTeam} vs ${prediction.awayTeam}`,
        text: `🎯 ${prediction.match} • ${prediction.market} @${prediction.odds.toFixed(2)} (${prediction.probability}%)`,
        files: [file],
      });
      return;
    } catch (err) {
      // If user cancelled, return silently
      if ((err as any)?.name === "AbortError") return;
    }
  }

  // Fallback for Desktop Browsers: Copy image to clipboard & download, then launch WhatsApp / Telegram
  await copyCardImageToClipboard(prediction);
  const shareText = encodeURIComponent(
    `🎯 *SmartBetBot AI Pronóstico Oficial*\n🏆 ${prediction.league} ${prediction.country ? `(${prediction.country})` : ""}\n⚽ *${prediction.homeTeam} vs ${prediction.awayTeam}*\n🎯 Pronóstico: *${prediction.market}* (${prediction.selection})\n💰 Cuota: *@${prediction.odds.toFixed(2)}* | Prob: *${prediction.probability}%*\n⭐ Confianza: *${prediction.confidence || "Muy Alta"}*\n\n_(¡Tarjeta gráfica copiada al portapapeles! Pégala con Ctrl+V)_\n🌐 https://smartbetbot.educandotea.com`
  );

  if (platform === "whatsapp") {
    window.open(`https://api.whatsapp.com/send?text=${shareText}`, "_blank");
  } else {
    window.open(`https://t.me/share/url?url=https://smartbetbot.educandotea.com&text=${shareText}`, "_blank");
  }
}

/**
 * Generates a high-resolution branded visual Ticket image for a complete Parlay
 */
export async function generateParlayCardBlob(
  picks: MarketOpportunity[],
  totalOdds: number,
  combinedProb: number,
  stake: number
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const width = 850;
  const legHeight = 72;
  const height = 290 + picks.length * legHeight + 70;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");

  // Background Gradient
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, "#080c14");
  bgGrad.addColorStop(0.5, "#0b1324");
  bgGrad.addColorStop(1, "#080c14");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Outer Border with Glow
  ctx.strokeStyle = "rgba(16, 185, 129, 0.45)";
  ctx.lineWidth = 4;
  ctx.strokeRect(16, 16, width - 32, height - 32);

  // Header Banner
  ctx.fillStyle = "rgba(16, 185, 129, 0.15)";
  ctx.fillRect(20, 20, width - 40, 80);

  // Logo & Title
  ctx.fillStyle = "#10b981";
  ctx.font = "900 24px system-ui, -apple-system, sans-serif";
  ctx.fillText("🔥 SMARTBETBOT AI", 40, 58);

  ctx.fillStyle = "#f8fafc";
  ctx.font = "900 18px system-ui, -apple-system, sans-serif";
  ctx.fillText(`PARLEY COMBINADO DEL DÍA (${picks.length} JUGADAS)`, 40, 84);

  // Date
  const now = new Date();
  const dateFormatted = now.toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 15px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`📅 ${dateFormatted}`, width - 40, 68);
  ctx.textAlign = "left";

  const totalFairOdds = picks.reduce((acc, p) => acc * (p.fairOdds || 1.3), 1);

  // Summary Metrics Card (4-column layout)
  ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
  ctx.beginPath();
  ctx.roundRect(40, 115, width - 80, 95, 16);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Metric 1: Total Odds Casa
  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 10px system-ui, -apple-system, sans-serif";
  ctx.fillText("🏢 CUOTA CASA DE APUESTAS", 50, 142);
  ctx.fillStyle = "#38bdf8";
  ctx.font = "900 24px system-ui, -apple-system, sans-serif";
  ctx.fillText(`@${totalOdds.toFixed(2)}`, 50, 180);

  // Metric 2: Total Fair Odds Modelo
  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 10px system-ui, -apple-system, sans-serif";
  ctx.fillText("🤖 CUOTA MODELO SMARTBETBOT", 260, 142);
  ctx.fillStyle = "#818cf8";
  ctx.font = "900 24px system-ui, -apple-system, sans-serif";
  ctx.fillText(`@${totalFairOdds.toFixed(2)}`, 260, 180);

  // Metric 3: Combined Probability
  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 10px system-ui, -apple-system, sans-serif";
  ctx.fillText("📈 PROB. ESTIMADA", 490, 142);
  ctx.fillStyle = "#34d399";
  ctx.font = "900 24px system-ui, -apple-system, sans-serif";
  ctx.fillText(`${combinedProb.toFixed(1)}%`, 490, 180);

  // Metric 4: Potential Return
  const potentialReturn = (stake * totalOdds).toFixed(2);
  const profit = (stake * totalOdds - stake).toFixed(2);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 10px system-ui, -apple-system, sans-serif";
  ctx.fillText(`💰 RETORNO ($${stake})`, 670, 142);
  ctx.fillStyle = "#facc15";
  ctx.font = "900 24px system-ui, -apple-system, sans-serif";
  ctx.fillText(`$${potentialReturn}`, 670, 180);

  // Legs Title
  ctx.fillStyle = "#94a3b8";
  ctx.font = "900 13px system-ui, -apple-system, sans-serif";
  ctx.fillText("SELECCIONES DEL TICKET (SIN REPETICIÓN):", 40, 238);

  // Render Each Match Leg
  let y = 250;
  picks.forEach((p, idx) => {
    // Leg Card Background
    ctx.fillStyle = idx % 2 === 0 ? "rgba(255, 255, 255, 0.04)" : "rgba(255, 255, 255, 0.02)";
    ctx.beginPath();
    ctx.roundRect(40, y, width - 80, legHeight - 8, 12);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Index Number Pill
    ctx.fillStyle = "rgba(16, 185, 129, 0.2)";
    ctx.beginPath();
    ctx.roundRect(50, y + 16, 30, 30, 8);
    ctx.fill();
    ctx.fillStyle = "#34d399";
    ctx.font = "900 14px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${idx + 1}`, 65, y + 36);
    ctx.textAlign = "left";

    // Match Teams & League
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 15px system-ui, -apple-system, sans-serif";
    ctx.fillText(`${p.homeTeam} vs ${p.awayTeam}`, 90, y + 26);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 11px system-ui, -apple-system, sans-serif";
    ctx.fillText(`🏆 ${p.league} ${p.country ? `(${p.country})` : ""}`, 90, y + 46);

    // Pick & Selection Box
    ctx.fillStyle = "rgba(16, 185, 129, 0.15)";
    ctx.beginPath();
    ctx.roundRect(width - 490, y + 14, 160, 36, 10);
    ctx.fill();
    ctx.strokeStyle = "rgba(16, 185, 129, 0.3)";
    ctx.stroke();
    ctx.fillStyle = "#10b981";
    ctx.font = "900 12px system-ui, -apple-system, sans-serif";
    ctx.fillText(`🎯 ${p.market}`, width - 480, y + 36);

    // Cuota Casa Pill
    ctx.fillStyle = "#0284c7";
    ctx.beginPath();
    ctx.roundRect(width - 320, y + 14, 140, 36, 10);
    ctx.fill();
    ctx.fillStyle = "#e0f2fe";
    ctx.font = "bold 9px system-ui, -apple-system, sans-serif";
    ctx.fillText("Casa Apuestas", width - 312, y + 36);
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 14px system-ui, -apple-system, sans-serif";
    ctx.fillText(`@${p.odds.toFixed(2)}`, width - 230, y + 36);

    // Cuota Modelo Pill
    ctx.fillStyle = "#4f46e5";
    ctx.beginPath();
    ctx.roundRect(width - 170, y + 14, 160, 36, 10);
    ctx.fill();
    ctx.fillStyle = "#e0e7ff";
    ctx.font = "bold 9px system-ui, -apple-system, sans-serif";
    ctx.fillText("Modelo SmartBetBot", width - 162, y + 36);
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 14px system-ui, -apple-system, sans-serif";
    ctx.fillText(`@${(p.fairOdds || 1.35).toFixed(2)}`, width - 50, y + 36);

    y += legHeight;
  });

  // Footer Banner
  ctx.fillStyle = "rgba(16, 185, 129, 0.08)";
  ctx.fillRect(20, height - 55, width - 40, 35);

  ctx.fillStyle = "#10b981";
  ctx.font = "bold 12px system-ui, -apple-system, sans-serif";
  ctx.fillText("🔒 Ticket Oficial Inmutable de SmartBetBot AI", 40, height - 33);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 12px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("🌐 smartbetbot.educandotea.com/parlay", width - 40, height - 33);
  ctx.textAlign = "left";

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to create blob from parlay canvas"));
    }, "image/png");
  });
}

/**
 * Copies the Parlay Ticket as an Image directly to the OS clipboard (Ctrl+V ready)
 */
export async function copyParlayCardImageToClipboard(
  picks: MarketOpportunity[],
  totalOdds: number,
  combinedProb: number,
  stake: number
): Promise<boolean> {
  try {
    const blob = await generateParlayCardBlob(picks, totalOdds, combinedProb, stake);

    if (navigator.clipboard && window.ClipboardItem) {
      const item = new ClipboardItem({ "image/png": blob });
      await navigator.clipboard.write([item]);
      return true;
    }

    // Fallback: download if clipboard API not permitted
    downloadParlayCardImage(picks, totalOdds, combinedProb, stake, blob);
    return true;
  } catch (err) {
    console.warn("Parlay clipboard write failed, downloading image as fallback:", err);
    try {
      const blob = await generateParlayCardBlob(picks, totalOdds, combinedProb, stake);
      downloadParlayCardImage(picks, totalOdds, combinedProb, stake, blob);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Downloads the Parlay Ticket as a PNG Image
 */
export async function downloadParlayCardImage(
  picks: MarketOpportunity[],
  totalOdds: number,
  combinedProb: number,
  stake: number,
  existingBlob?: Blob
) {
  const blob = existingBlob || (await generateParlayCardBlob(picks, totalOdds, combinedProb, stake));
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `SmartBetBot-Parley-${picks.length}-Jugadas.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Shares the Parlay Ticket as an Image via Web Share API or launches WhatsApp/Telegram
 */
export async function shareParlayCardAsImage(
  picks: MarketOpportunity[],
  totalOdds: number,
  combinedProb: number,
  stake: number,
  platform: "whatsapp" | "telegram"
): Promise<void> {
  const blob = await generateParlayCardBlob(picks, totalOdds, combinedProb, stake);
  const file = new File([blob], `SmartBetBot-Parley-${picks.length}-Jugadas.png`, { type: "image/png" });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        title: `🔥 Parley Combinado del Día (${picks.length} Jugadas)`,
        text: `🔥 Cuota Total: @${totalOdds.toFixed(2)} | Prob: ${combinedProb.toFixed(1)}%`,
        files: [file],
      });
      return;
    } catch (err) {
      if ((err as any)?.name === "AbortError") return;
    }
  }

  // Fallback: Copy image to clipboard and open WhatsApp / Telegram
  await copyParlayCardImageToClipboard(picks, totalOdds, combinedProb, stake);
  const shareText = encodeURIComponent(
    `🔥 *PARLEY COMBINADO DEL DÍA (${picks.length} JUGADAS)*\n🎯 *Cuota Total:* @${totalOdds.toFixed(2)} | *Prob:* ${combinedProb.toFixed(1)}%\n💰 *Retorno Potencial (Stake $${stake}):* *$${(stake * totalOdds).toFixed(2)}*\n\n_(¡Tarjeta gráfica del parley copiada al portapapeles! Pégala con Ctrl+V en este chat)_\n🌐 https://smartbetbot.educandotea.com/parlay`
  );

  if (platform === "whatsapp") {
    window.open(`https://api.whatsapp.com/send?text=${shareText}`, "_blank");
  } else {
    window.open(`https://t.me/share/url?url=https://smartbetbot.educandotea.com/parlay&text=${shareText}`, "_blank");
  }
}
