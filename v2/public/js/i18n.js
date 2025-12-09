/**
 * Internationalization (i18n) for Shorts Maker v2
 */

const i18n = {
  currentLang: localStorage.getItem("language") || "en",

  translations: {
    en: {
      // Header
      appTitle: "Shorts Maker",
      signIn: "Sign in with YouTube",
      signOut: "Sign out",

      // Sidebar - Channel
      channel: "Channel",
      searchChannels: "Search YouTube channels...",
      selectedChannel: "Selected channel",

      // Sidebar - Videos
      videos: "Videos",
      searchVideos: "Search videos...",
      all: "All",
      inProgress: "In Progress",
      finished: "Finished",
      ignored: "Ignored",
      noVideosFound: "No videos found",
      selectChannel: "Select a channel to see videos",
      loading: "Loading...",

      // Editor
      selectVideo: "Select a video to start editing",
      clickVideoToEdit: "Click on a video from the sidebar to load it here",
      play: "Play",
      playPause: "Play/Pause",
      goToStart: "Go to start",
      seekBack: "Seek -10s",
      seekForward: "Seek +10s",
      addSeam: "Add Seam",

      // Segments Panel
      segments: "Segments",
      save: "Save",
      markFinished: "Mark Finished",
      ignore: "Ignore Video",
      unignore: "Unignore",
      noSegments: "No segments yet",
      addSeamsToCreate: "Add seams to create segments",
      segment: "Segment",
      preview: "Preview",
      queue: "Queue",
      upload: "Upload",
      delete: "Delete",

      // Segment names
      segmentName: "Segment name",
      overlayText: "Overlay text (optional)",
      addAnimatedText: "Add animated text...",
      overlayTitle: "Overlay Title",
      overlayTitlePlaceholder: "Video title for overlays...",
      done: "Done",
      edit: "Edit",
      remove: "Remove",

      // Upload Panel
      uploadSettings: "Upload Settings",
      titleTemplate: "Title Template",
      category: "Category",
      privacy: "Privacy",
      private: "Private",
      unlisted: "Unlisted",
      public: "Public",
      description: "Description",
      descriptionPlaceholder: "Description for your shorts...",
      tags: "Tags",
      tagsPlaceholder: "tag1, tag2, tag3",
      processLocally: "Process locally (FFmpeg.wasm)",
      processLocallyHint:
        "Uses your device for video processing instead of server. Faster for slow servers.",
      addAllToQueue: "Add All to Queue",
      noSegmentsToUpload: "No segments to upload",

      // YouTube Cookies
      youtubeCookies: "YouTube Cookies",
      cookiesUploaded: "Uploaded",
      cookiesNotUploaded: "Not uploaded",
      uploadCookies: "Upload cookies.txt",
      cookiesHint: "Export cookies from browser using",
      cookiesExtension: "Get cookies.txt",
      cookiesRequired: "extension. Required if YouTube blocks downloads.",

      // Queue Sidebar
      queueTitle: "Queue",
      process: "Process",
      syncToServer: "Sync to Server",
      clear: "Clear",
      serverQueue: "Server Queue",
      queueEmpty: "Queue is empty",
      addSegmentsToStart: "Add segments to start processing",
      edit: "Edit",
      remove: "Remove",

      // Server Queue Modal
      serverQueueTitle: "Server Queue",
      refresh: "Refresh",
      noItemsInServerQueue: "No items in server queue",
      importToLocal: "Import to Local",
      processAll: "Process All",
      clearServerQueue: "Clear Server Queue",
      items: "items",
      lastUpdated: "Last updated",

      // Queue Edit Modal
      editQueueItem: "Edit Queue Item",
      uploadTitle: "Upload Title",
      startTime: "Start Time",
      endTime: "End Time",
      duration: "Duration",
      cancel: "Cancel",
      saveChanges: "Save Changes",

      // Preview Modal
      segmentPreview: "Segment Preview",
      processing: "Processing segment...",
      uploadToYouTube: "Upload to YouTube",

      // Toasts
      success: "Success",
      error: "Error",
      warning: "Warning",
      info: "Info",
      connected: "Connected!",
      connectedToYouTube: "Successfully connected to YouTube",
      authFailed: "Auth failed",
      couldNotConnect: "Could not connect to YouTube",
      signInRequired: "Sign in required",
      pleaseSignIn: "Please sign in to YouTube first",
      queueSaved: "Queue saved",
      itemsSentToServer: "items sent to server",
      alreadySynced: "Already synced",
      allItemsOnServer: "All items already on server",
      queueSynced: "Queue synced",
      newItemsAdded: "new items added to server",
      total: "total",
      failedToSync: "Failed to sync",
      cookiesUploadedSuccess: "Cookies uploaded",
      cookiesSaved: "YouTube authentication cookies saved",
      uploadFailed: "Upload failed",
      previewFailed: "Preview failed",
      itemDeleted: "Item deleted",
      removedFromServer: "Removed from server queue",
      deleteFailed: "Delete failed",
      serverQueueCleared: "Server queue cleared",
      allItemsRemoved: "All items removed",
      clearFailed: "Clear failed",
      imported: "Imported",
      itemsAddedToLocal: "items added to local queue",
      noNewItems: "No new items",
      allItemsInLocal: "All items already in local queue",
      nothingToImport: "Nothing to import",
      serverQueueEmpty: "Server queue is empty",
      queueCleared: "Queue cleared",
      allItemsRemovedFromQueue: "All items removed from queue",
      nothingToProcess: "Nothing to process",
      noPendingItems: "No pending items in queue",
      processingQueue: "Processing queue",
      processingItem: "Processing item",
      of: "of",
      uploaded: "Uploaded",
      uploadedSuccess: "uploaded!",
      allDone: "All done!",
      allItemsUploaded: "All items uploaded successfully",
      processingComplete: "Processing complete",
      failed: "failed",
      seamAdded: "Seam added",
      seamRemoved: "Seam removed",
      seamUpdated: "Seam updated",
      videoMarkedFinished: "Video marked finished",
      videoIgnored: "Video ignored",
      videoUnignored: "Video unignored",
      addedToQueue: "Added to queue",
      removedFromQueue: "Removed from queue",

      // Production mode
      server: "SERVER",
      localProcessingDisabled: "Local processing disabled",

      // Misc
      close: "Close",
      yes: "Yes",
      no: "No",
      confirm: "Confirm",
      checking: "Checking...",
      errorLoading: "Error loading",
    },

    fr: {
      // Header
      appTitle: "Créateur de Shorts",
      signIn: "Se connecter avec YouTube",
      signOut: "Se déconnecter",

      // Sidebar - Channel
      channel: "Chaîne",
      searchChannels: "Rechercher des chaînes YouTube...",
      selectedChannel: "Chaîne sélectionnée",

      // Sidebar - Videos
      videos: "Vidéos",
      searchVideos: "Rechercher des vidéos...",
      all: "Toutes",
      inProgress: "En cours",
      finished: "Terminées",
      ignored: "Ignorées",
      noVideosFound: "Aucune vidéo trouvée",
      selectChannel: "Sélectionnez une chaîne pour voir les vidéos",
      loading: "Chargement...",

      // Editor
      selectVideo: "Sélectionnez une vidéo pour commencer l'édition",
      clickVideoToEdit:
        "Cliquez sur une vidéo dans la barre latérale pour la charger ici",
      play: "Lire",
      playPause: "Lecture/Pause",
      goToStart: "Aller au début",
      seekBack: "Reculer -10s",
      seekForward: "Avancer +10s",
      addSeam: "Ajouter un repère",

      // Segments Panel
      segments: "Segments",
      save: "Sauvegarder",
      markFinished: "Marquer terminé",
      ignore: "Ignorer la vidéo",
      unignore: "Ne plus ignorer",
      noSegments: "Aucun segment",
      addSeamsToCreate: "Ajoutez des repères pour créer des segments",
      segment: "Segment",
      preview: "Aperçu",
      queue: "File",
      upload: "Téléverser",
      delete: "Supprimer",

      // Segment names
      segmentName: "Nom du segment",
      overlayText: "Texte superposé (optionnel)",
      addAnimatedText: "Ajouter un texte animé...",
      overlayTitle: "Titre de superposition",
      overlayTitlePlaceholder: "Titre vidéo pour les superpositions...",
      done: "Terminé",
      edit: "Modifier",
      remove: "Retirer",

      // Upload Panel
      uploadSettings: "Paramètres de téléversement",
      titleTemplate: "Modèle de titre",
      category: "Catégorie",
      privacy: "Confidentialité",
      private: "Privé",
      unlisted: "Non répertorié",
      public: "Public",
      description: "Description",
      descriptionPlaceholder: "Description pour vos shorts...",
      tags: "Tags",
      tagsPlaceholder: "tag1, tag2, tag3",
      processLocally: "Traiter localement (FFmpeg.wasm)",
      processLocallyHint:
        "Utilise votre appareil pour le traitement vidéo au lieu du serveur. Plus rapide pour les serveurs lents.",
      addAllToQueue: "Tout ajouter à la file",
      noSegmentsToUpload: "Aucun segment à téléverser",

      // YouTube Cookies
      youtubeCookies: "Cookies YouTube",
      cookiesUploaded: "Téléversé",
      cookiesNotUploaded: "Non téléversé",
      uploadCookies: "Téléverser cookies.txt",
      cookiesHint: "Exportez les cookies depuis le navigateur avec",
      cookiesExtension: "Get cookies.txt",
      cookiesRequired:
        "extension. Requis si YouTube bloque les téléchargements.",

      // Queue Sidebar
      queueTitle: "File d'attente",
      process: "Traiter",
      syncToServer: "Sync serveur",
      clear: "Vider",
      serverQueue: "File serveur",
      queueEmpty: "La file est vide",
      addSegmentsToStart: "Ajoutez des segments pour commencer le traitement",
      edit: "Modifier",
      remove: "Retirer",

      // Server Queue Modal
      serverQueueTitle: "File d'attente serveur",
      refresh: "Actualiser",
      noItemsInServerQueue: "Aucun élément dans la file serveur",
      importToLocal: "Importer en local",
      processAll: "Tout traiter",
      clearServerQueue: "Vider la file serveur",
      items: "éléments",
      lastUpdated: "Dernière mise à jour",

      // Queue Edit Modal
      editQueueItem: "Modifier l'élément",
      uploadTitle: "Titre de téléversement",
      startTime: "Début",
      endTime: "Fin",
      duration: "Durée",
      cancel: "Annuler",
      saveChanges: "Enregistrer",

      // Preview Modal
      segmentPreview: "Aperçu du segment",
      processing: "Traitement du segment...",
      uploadToYouTube: "Téléverser sur YouTube",

      // Toasts
      success: "Succès",
      error: "Erreur",
      warning: "Attention",
      info: "Info",
      connected: "Connecté !",
      connectedToYouTube: "Connecté à YouTube avec succès",
      authFailed: "Échec de connexion",
      couldNotConnect: "Impossible de se connecter à YouTube",
      signInRequired: "Connexion requise",
      pleaseSignIn: "Veuillez vous connecter à YouTube d'abord",
      queueSaved: "File sauvegardée",
      itemsSentToServer: "éléments envoyés au serveur",
      alreadySynced: "Déjà synchronisé",
      allItemsOnServer: "Tous les éléments sont déjà sur le serveur",
      queueSynced: "File synchronisée",
      newItemsAdded: "nouveaux éléments ajoutés au serveur",
      total: "total",
      failedToSync: "Échec de synchronisation",
      cookiesUploadedSuccess: "Cookies téléversés",
      cookiesSaved: "Cookies d'authentification YouTube sauvegardés",
      uploadFailed: "Échec du téléversement",
      previewFailed: "Échec de l'aperçu",
      itemDeleted: "Élément supprimé",
      removedFromServer: "Retiré de la file serveur",
      deleteFailed: "Échec de suppression",
      serverQueueCleared: "File serveur vidée",
      allItemsRemoved: "Tous les éléments supprimés",
      clearFailed: "Échec du vidage",
      imported: "Importé",
      itemsAddedToLocal: "éléments ajoutés à la file locale",
      noNewItems: "Aucun nouvel élément",
      allItemsInLocal: "Tous les éléments sont déjà dans la file locale",
      nothingToImport: "Rien à importer",
      serverQueueEmpty: "La file serveur est vide",
      queueCleared: "File vidée",
      allItemsRemovedFromQueue: "Tous les éléments retirés de la file",
      nothingToProcess: "Rien à traiter",
      noPendingItems: "Aucun élément en attente dans la file",
      processingQueue: "Traitement de la file",
      processingItem: "Traitement de l'élément",
      of: "sur",
      uploaded: "Téléversé",
      uploadedSuccess: "téléversé !",
      allDone: "Terminé !",
      allItemsUploaded: "Tous les éléments téléversés avec succès",
      processingComplete: "Traitement terminé",
      failed: "échoué",
      seamAdded: "Repère ajouté",
      seamRemoved: "Repère supprimé",
      seamUpdated: "Repère mis à jour",
      videoMarkedFinished: "Vidéo marquée terminée",
      videoIgnored: "Vidéo ignorée",
      videoUnignored: "Vidéo non ignorée",
      addedToQueue: "Ajouté à la file",
      removedFromQueue: "Retiré de la file",

      // Production mode
      server: "SERVEUR",
      localProcessingDisabled: "Traitement local désactivé",

      // Misc
      close: "Fermer",
      yes: "Oui",
      no: "Non",
      confirm: "Confirmer",
      checking: "Vérification...",
      errorLoading: "Erreur de chargement",
    },
  },

  // Get translation
  t(key, params = {}) {
    const lang = this.translations[this.currentLang] || this.translations.en;
    let text = lang[key] || this.translations.en[key] || key;

    // Replace parameters like {count}, {name}
    Object.keys(params).forEach((param) => {
      text = text.replace(new RegExp(`{${param}}`, "g"), params[param]);
    });

    return text;
  },

  // Set language
  setLanguage(lang) {
    if (this.translations[lang]) {
      this.currentLang = lang;
      localStorage.setItem("language", lang);
      this.updateUI();
      return true;
    }
    return false;
  },

  // Get current language
  getLanguage() {
    return this.currentLang;
  },

  // Update all UI elements with data-i18n attribute
  updateUI() {
    // Update elements with data-i18n attribute
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      el.textContent = this.t(key);
    });

    // Update elements with data-i18n-placeholder attribute
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      el.placeholder = this.t(key);
    });

    // Update elements with data-i18n-title attribute
    document.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const key = el.getAttribute("data-i18n-title");
      el.title = this.t(key);
    });

    // Dispatch event for JS components to update
    document.dispatchEvent(
      new CustomEvent("languageChanged", { detail: { lang: this.currentLang } })
    );
  },

  // Initialize
  init() {
    this.updateUI();
  },
};

// Shorthand function
const t = (key, params) => i18n.t(key, params);
