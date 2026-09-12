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
    navFeatured: "⭐ Destacados",
    navSignals: "Alertas Pre-Match",
    navLive: "Alertas en Vivo",
    navPicks: "Alertas Pre-Match",
    navParlay: "Parlay del Día",
    navReports: "Reportes",
    navHistory: "Historial",
    navProfile: "Mi Perfil",
    navSettings: "Ajustes",
    navAdmin: "Admin",
    navSync: "Actualizar",
    navSyncing: "Sincronizando...",
    navLogout: "Cerrar Sesión",
    navBettor: "Apostador",
    navAdminRole: "Administrador",
    navSubtitle: "Inteligencia Deportiva",
    navModules: "Menú",
    navResponsible: "Apuesta con responsabilidad",

    // Dashboard
    dashboardKicker: "Panel Principal",
    dashboardTitle: "Centro de Inteligencia Deportiva",
    dashboardSubtitle: "Pronósticos inteligentes seleccionados automáticamente con apoyo de Inteligencia Artificial, según las mejores oportunidades del día, con especial enfoque en victorias del equipo local y partidos con más de 2.5 goles. SmartBetBot combina IA, estadísticas, rendimiento y tendencias para mostrarte las opciones con mayor potencial de forma clara, rápida y sencilla.",
    statActivePicks: "Alertas Activas",
    statAvgOdds: "Cuota Promedio",
    statAvgProb: "Probabilidad Media",
    filterTimeAll: "📅 Todas",
    filterTimeToday: "🔥 Hoy",
    filterTimeTomorrow: "⏰ Mañana",
    filterTimeWeek: "📆 Esta Semana",
    filterDateLabel: "Fecha:",
    filterLeagueLabel: "Liga:",
    filterMarketLabel: "Mercado:",
    filterConfidenceLabel: "Confianza:",
    allConfidence: "Todas las Confianzas",
    allLeagues: "Todas las Ligas",
    allMarkets: "Todos los Mercados",
    loadingSignals: "Analizando oportunidades con cuotas actualizadas...",
    noPicksFound: "No se encontraron pronósticos para este filtro",
    noPicksHint: "Prueba seleccionando 'Todas' o haz clic en '⚡ Actualizar' en el menú superior.",

    // Live Module
    liveKicker: "Tiempo Real",
    liveTitle: "Alertas en Vivo",
    liveSubtitle: "Monitoreo en tiempo real minuto a minuto, marcadores en vivo y oportunidades dinámicas de alto valor",
    livePolling: "Actualización en vivo cada 15s",
    noLiveMatches: "No hay partidos en juego en este momento",
    noLiveMatchesHint: "Consulta las Alertas Pre-Match para ver los próximos partidos programados.",

    // Pre-Match Module
    signalsKicker: "Pronósticos Pre-Partido",
    signalsTitle: "Alertas Pre-Match",
    signalsSubtitle: "Algoritmo Cuantitativo Pre-Partido & Modelos Poisson / ELO con valor matemático positivo",

    // Prediction Card
    matchLabel: "Partido",
    marketLabel: "Mercado",
    oddsLabel: "Cuota",
    probLabel: "Probabilidad",
    aiExplanation: "Explicación de SmartBetBot",
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
    navFeatured: "⭐ Featured",
    navSignals: "Pre-Match Alerts",
    navLive: "Live Alerts",
    navPicks: "Pre-Match Alerts",
    navParlay: "Daily Parlay",
    navReports: "Reports",
    navHistory: "History",
    navProfile: "My Profile",
    navSettings: "Settings",
    navAdmin: "Admin",
    navSync: "Update",
    navSyncing: "Syncing...",
    navLogout: "Log Out",
    navBettor: "Bettor",
    navAdminRole: "Administrator",
    navSubtitle: "Sports Intelligence",
    navModules: "Menu",
    navResponsible: "Responsible Gambling",

    // Dashboard
    dashboardKicker: "Main Dashboard",
    dashboardTitle: "Sports Intelligence Center",
    dashboardSubtitle: "Smart forecasts automatically selected with AI support based on the best daily opportunities, with special focus on home wins and over 2.5 goals. SmartBetBot combines AI, stats, form, and trends to highlight high-potential picks clearly and simply.",
    statActivePicks: "Active Alerts",
    statAvgOdds: "Average Odds",
    statAvgProb: "Average Probability",
    filterTimeAll: "📅 All",
    filterTimeToday: "🔥 Today",
    filterTimeTomorrow: "⏰ Tomorrow",
    filterTimeWeek: "📆 This Week",
    filterDateLabel: "Date:",
    filterLeagueLabel: "League:",
    filterMarketLabel: "Market:",
    filterConfidenceLabel: "Confidence:",
    allConfidence: "All Confidence Levels",
    allLeagues: "All Leagues",
    allMarkets: "All Markets",
    loadingSignals: "Analyzing betting opportunities with live odds...",
    noPicksFound: "No predictions found for this filter",
    noPicksHint: "Try selecting 'All' or click '⚡ Update' in the top navigation bar.",

    // Live Module
    liveKicker: "Real-Time In-Play",
    liveTitle: "Live Alerts",
    liveSubtitle: "Real-time in-play match tracking, dynamic odds & live scoring opportunities",
    livePolling: "Live polling every 15s",
    noLiveMatches: "No matches in play right now",
    noLiveMatchesHint: "Check Pre-Match Alerts to view scheduled upcoming matches.",

    // Pre-Match Module
    signalsKicker: "Pre-Game Intelligence",
    signalsTitle: "Pre-Match Alerts",
    signalsSubtitle: "Pre-match quantitative Poisson models & positive expected value opportunities",

    // Prediction Card
    matchLabel: "Match",
    marketLabel: "Market",
    oddsLabel: "Odds",
    probLabel: "Probability",
    aiExplanation: "SmartBetBot Analysis",
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
