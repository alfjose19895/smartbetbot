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

  // Confidence Pill
  const confText = prediction.confidence === "Muy Alta" ? "⭐⭐⭐ MUY ALTA (85%+)" : prediction.confidence === "Alta" ? "⭐⭐ ALTA SEGURIDAD" : "⭐ MEDIA";
  ctx.fillStyle = "rgba(16, 185, 129, 0.25)";
  ctx.beginPath();
  ctx.roundRect(width - 290, 110, 250, 34, 12);
  ctx.fill();
  ctx.fillStyle = "#34d399";
  ctx.font = "900 13px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(confText, width - 165, 133);
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
  ctx.fillText("🎯 PRONÓSTICO OFICIAL DE ALTA PRECISIÓN", 60, 340);

  ctx.fillStyle = "#ffffff";
  ctx.font = "900 24px system-ui, -apple-system, sans-serif";
  ctx.fillText(`${prediction.market} (${prediction.selection})`, 60, 385);

  // Cuota Badge
  ctx.fillStyle = "#0284c7";
  ctx.beginPath();
  ctx.roundRect(width - 280, 335, 100, 65, 14);
  ctx.fill();
  ctx.fillStyle = "#e0f2fe";
  ctx.font = "bold 11px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("CUOTA", width - 230, 355);
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 22px system-ui, -apple-system, sans-serif";
  ctx.fillText(`@${prediction.odds.toFixed(2)}`, width - 230, 385);

  // Probabilidad Badge
  ctx.fillStyle = "#059669";
  ctx.beginPath();
  ctx.roundRect(width - 165, 335, 105, 65, 14);
  ctx.fill();
  ctx.fillStyle = "#d1fae5";
  ctx.font = "bold 11px system-ui, -apple-system, sans-serif";
  ctx.fillText("PROB.", width - 112, 355);
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 22px system-ui, -apple-system, sans-serif";
  ctx.fillText(`${prediction.probability}%`, width - 112, 385);
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
