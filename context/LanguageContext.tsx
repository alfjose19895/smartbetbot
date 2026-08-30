"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export type Language = "es" | "en";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const TRANSLATIONS: Record<Language, Record<string, string>> = {
  es: {
    // Navigation
    navDashboard: "Dashboard",
    navPicks: "Picks",
    navHistory: "Historial",
    navProfile: "Mi Perfil",
    navAdmin: "Admin",
    navSync: "Actualizar",
    navSyncing: "Sincronizando...",
    navLogout: "Cerrar Sesión",
    navBettor: "Apostador",
    navAdminRole: "Administrador",
    navSubtitle: "Inteligencia Deportiva",

    // Dashboard
    dashboardKicker: "Panel Principal",
    dashboardTitle: "Inteligencia Deportiva en Tiempo Real",
    dashboardSubtitle: "Predicciones fundamentadas con modelos matemáticos y cálculo de cuotas justas",
    statActivePicks: "Picks Activos",
    statAvgOdds: "Cuota Promedio",
    statAvgProb: "Probabilidad Media",
    filterTimeAll: "📅 Todos",
    filterTimeToday: "🔥 Hoy",
    filterTimeTomorrow: "⏰ Mañana",
    filterTimeWeek: "📆 Esta Semana",
    filterDateLabel: "Fecha:",
    filterLeagueLabel: "Liga:",
    filterMarketLabel: "Mercado:",
    allLeagues: "Todas las Ligas",
    allMarkets: "Todos los Mercados",
    loadingSignals: "Analizando oportunidades con cuotas actualizadas...",
    noPicksFound: "No se encontraron pronósticos para este filtro",
    noPicksHint: "Prueba seleccionando 'Todos' o haz clic en '⚡ Actualizar' en el menú superior.",

    // Prediction Card
    matchLabel: "Partido",
    marketLabel: "Mercado",
    oddsLabel: "Cuota",
    probLabel: "Probabilidad",
    aiExplanation: "Explicación IA",
    confVeryHigh: "Confianza Muy Alta",
    confHigh: "Confianza Alta",
    confMedium: "Confianza Media",
    confLow: "Confianza Baja",
    copyBtn: "Copiar",
    copiedBtn: "✓ Copiado",
    storyBtn: "Historia",
    storyTitle: "Análisis Estadístico",
    downloadStoryBtn: "Descargar Imagen para Historia",
    generatingStory: "Generando Imagen PNG...",
    closeModal: "Cerrar",
    smartEdge: "Edge",
    smartScore: "Score",

    // History
    historyKicker: "Historial Oficial",
    historyTitle: "Pronósticos Deportivos Resueltos",
    historySubtitle: "Registro histórico de partidos acontecidos con marcadores oficiales y cálculo de rentabilidad",
    historyEvaluated: "Partidos Evaluados",
    historyWinRate: "Tasa de Acierto",
    historyProfit: "Balance Neto",
    viewCards: "Tarjetas",
    viewTable: "Tabla",
    filterResult: "Resultado:",
    filterAll: "Todos",
    filterWon: "✓ Ganadas",
    filterLost: "✗ Perdidas",
    colDate: "Fecha",
    colMatch: "Partido",
    colScore: "Marcador",
    colMarket: "Mercado",
    colOdds: "Cuota",
    colProb: "Prob.",
    colResult: "Resultado",
    wonBadge: "Ganada",
    lostBadge: "Perdida",

    // Profile / Settings
    profileKicker: "Gestión Personal",
    profileTitle: "Mi Perfil & Ajustes de Apostador",
    profileSubtitle: "Modifica tus nombres, correo de acceso, contraseña personal y preferencias de idioma",
    profileActiveStatus: "Cuenta Activa",
    profileEditSection: "Modificar Información de la Cuenta",
    profileFullName: "Nombres y Apellidos",
    profileEmail: "Correo Electrónico de Acceso",
    profileNewPass: "Nueva Contraseña",
    profileNewPassHint: "opcional (dejar en blanco para conservar actual)",
    profileConfirmPass: "Confirmar Nueva Contraseña",
    profileSaveBtn: "Guardar Cambios en Mi Perfil",
    profileSavingBtn: "Guardando...",
    prefSection: "Preferencias de Análisis & Filtros",
    prefMinProb: "Probabilidad Mínima Preferida:",
    prefMinOdds: "Cuota Mínima en Picks:",
    prefLangTitle: "Idioma de la Plataforma:",
    prefLangSelect: "Seleccionar Idioma",
    langEs: "🇪🇸 Español",
    langEn: "🇺🇸 English",

    // Auth & General
    backHome: "← Volver al Inicio",
    whatsappTooltip: "¿Dudas con los picks? Escríbenos",
  },
  en: {
    // Navigation
    navDashboard: "Dashboard",
    navPicks: "Picks",
    navHistory: "History",
    navProfile: "My Profile",
    navAdmin: "Admin",
    navSync: "Update",
    navSyncing: "Syncing...",
    navLogout: "Log Out",
    navBettor: "Bettor",
    navAdminRole: "Administrator",
    navSubtitle: "Sports Intelligence",

    // Dashboard
    dashboardKicker: "Main Dashboard",
    dashboardTitle: "Real-Time Sports Intelligence",
    dashboardSubtitle: "Mathematical Poisson models & fair-odds value betting predictions",
    statActivePicks: "Active Picks",
    statAvgOdds: "Average Odds",
    statAvgProb: "Average Probability",
    filterTimeAll: "📅 All",
    filterTimeToday: "🔥 Today",
    filterTimeTomorrow: "⏰ Tomorrow",
    filterTimeWeek: "📆 This Week",
    filterDateLabel: "Date:",
    filterLeagueLabel: "League:",
    filterMarketLabel: "Market:",
    allLeagues: "All Leagues",
    allMarkets: "All Markets",
    loadingSignals: "Analyzing betting opportunities with live odds...",
    noPicksFound: "No predictions found for this filter",
    noPicksHint: "Try selecting 'All' or click '⚡ Update' in the top navigation bar.",

    // Prediction Card
    matchLabel: "Match",
    marketLabel: "Market",
    oddsLabel: "Odds",
    probLabel: "Probability",
    aiExplanation: "AI Explanation",
    confVeryHigh: "Very High Confidence",
    confHigh: "High Confidence",
    confMedium: "Medium Confidence",
    confLow: "Low Confidence",
    copyBtn: "Copy",
    copiedBtn: "✓ Copied",
    storyBtn: "Story",
    storyTitle: "Statistical Analysis",
    downloadStoryBtn: "Download Image for Social Story",
    generatingStory: "Generating PNG Image...",
    closeModal: "Close",
    smartEdge: "Edge",
    smartScore: "Score",

    // History
    historyKicker: "Official History",
    historyTitle: "Resolved Sports Predictions",
    historySubtitle: "Official match track record with final scores and profitability metrics",
    historyEvaluated: "Evaluated Matches",
    historyWinRate: "Win Rate",
    historyProfit: "Net Profit",
    viewCards: "Cards",
    viewTable: "Table",
    filterResult: "Result:",
    filterAll: "All",
    filterWon: "✓ Won",
    filterLost: "✗ Lost",
    colDate: "Date",
    colMatch: "Match",
    colScore: "Score",
    colMarket: "Market",
    colOdds: "Odds",
    colProb: "Prob.",
    colResult: "Result",
    wonBadge: "Won",
    lostBadge: "Lost",

    // Profile / Settings
    profileKicker: "Personal Management",
    profileTitle: "My Profile & Account Settings",
    profileSubtitle: "Update your full name, login email, password and language preferences",
    profileActiveStatus: "Active Account",
    profileEditSection: "Edit Account Information",
    profileFullName: "Full Name",
    profileEmail: "Login Email",
    profileNewPass: "New Password",
    profileNewPassHint: "optional (leave blank to keep current)",
    profileConfirmPass: "Confirm New Password",
    profileSaveBtn: "Save Changes to My Profile",
    profileSavingBtn: "Saving...",
    prefSection: "Analysis & Filter Preferences",
    prefMinProb: "Preferred Minimum Probability:",
    prefMinOdds: "Minimum Odds in Picks:",
    prefLangTitle: "Platform Language:",
    prefLangSelect: "Select Language",
    langEs: "🇪🇸 Spanish",
    langEn: "🇺🇸 English",

    // Auth & General
    backHome: "← Back to Home",
    whatsappTooltip: "Questions about picks? Chat with us",
  },
};

const LanguageContext = createContext<LanguageContextType>({
  language: "es",
  setLanguage: () => {},
  t: (key: string) => key,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("es");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("smartbetbot_lang") as Language | null;
      if (saved === "es" || saved === "en") {
        setLanguageState(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem("smartbetbot_lang", lang);
      document.documentElement.lang = lang;
    } catch {
      // ignore
    }
  };

  const t = (key: string): string => {
    const dict = TRANSLATIONS[language] || TRANSLATIONS.es;
    return dict[key] || TRANSLATIONS.es[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
