/**
 * Main Popup Controller class that orchestrates all popup functionality
 */
class PopupController {
  constructor() {
    this.state = new PopupState();
    this.uiManager = new UIManager();
    this.messageHandler = new MessageHandler(this);
    this.masterVolumeManager = new MasterVolumeManager(this.state, this.uiManager, this.messageHandler);
    this.tabListManager = new TabListManager(this.state, this.uiManager, this.messageHandler);
  }

  /**
   * Initialize popup interface
   */
  async init() {
    try {
      // Initialize UI components
      this.uiManager.initializeElements();
      this.uiManager.initializeMasterVolumeSlider();
      this.uiManager.updateVolumeLabels();
      this.uiManager.updatePresetButtons();
      
      // Initialize theme manager
      await this.uiManager.initializeTheme();

      // Set up event listeners
      this.setupEventListeners();
      
      // Load audio tabs
      await this.loadAudioTabs();
    } catch (error) {
      console.error('Failed to initialize popup:', error);
    }
  }

  /**
   * Set up all event listeners
   */
  setupEventListeners() {
    // Set up message listeners
    this.messageHandler.setupMessageListeners();
    
    // Set up master volume listeners
    this.masterVolumeManager.setupEventListeners();
    
    // Control buttons
    this.uiManager.getElement('applyToAllBtn').addEventListener('click', () => {
      this.masterVolumeManager.applyToAllTabs().then(() => {
        this.tabListManager.updateDisplay();
      });
    });
    
    this.uiManager.getElement('refreshBtn').addEventListener('click', () => {
      this.loadAudioTabs();
    });
    
    this.uiManager.getElement('resetBtn').addEventListener('click', () => {
      this.masterVolumeManager.resetAllTabs().then(() => {
        setTimeout(() => this.loadAudioTabs(), CONFIG.TIMING.REFRESH_DELAY);
      });
    });
  }

  /**
   * Load audio tabs from background script
   */
  async loadAudioTabs() {
    try {
      // If we just applied master volume, don't reload to prevent UI flicker
      if (this.state.wasJustApplied()) {
        return;
      }
      
      this.uiManager.showLoadingMessage();
      
      const response = await this.messageHandler.getTabAudioStatus();
      
      if (response?.tabs) {
        this.state.setAudioTabs(response.tabs);
        
        // Query each tab for its actual current volume to ensure accuracy
        await this.tabListManager.syncTabVolumes();
        
        // Render the tab list
        this.tabListManager.render();
      } else {
        this.uiManager.showNoAudioMessage();
      }
    } catch (error) {
      console.error('Failed to load audio tabs:', error);
      this.uiManager.showNoAudioMessage();
    }
  }
}
