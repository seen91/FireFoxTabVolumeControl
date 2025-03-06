document.addEventListener('DOMContentLoaded', function() {
  const volumeSlider = document.getElementById('volume-slider');
  const volumeValue = document.getElementById('volume-value');
  const preset0 = document.getElementById('preset-0');
  const preset100 = document.getElementById('preset-100');
  const preset200 = document.getElementById('preset-200');
  const preset500 = document.getElementById('preset-500');
  const applyToAllButton = document.getElementById('apply-to-all');
  const resetButton = document.getElementById('reset');
  const statusMessage = document.getElementById('status-message');
  const amplificationWarning = document.getElementById('amplification-warning');
  const volumeValueContainer = document.querySelector('.volume-value-container');

  // Update UI based on volume level
  function updateVolumeUI(volume) {
    // Update the display
    volumeValue.textContent = volume + '%';
    volumeSlider.value = volume;
    
    // Show amplification warning for high volumes
    if (volume > 100) {
      amplificationWarning.style.display = 'block';
    } else {
      amplificationWarning.style.display = 'none';
    }
    
    // Change the volume display color based on level
    let backgroundColor, textColor;
    
    if (volume === 0) {
      backgroundColor = '#b1b1b3'; // Gray for muted
      textColor = '#0c0c0d';
    } else if (volume <= 100) {
      backgroundColor = `linear-gradient(to right, #0060df, #0a84ff)`;
      textColor = 'white';
    } else if (volume <= 200) {
      backgroundColor = `linear-gradient(to right, #0a84ff, #45a1ff)`;
      textColor = 'white';
    } else if (volume <= 300) {
      backgroundColor = `linear-gradient(to right, #45a1ff, #00ffd8)`;
      textColor = '#0c0c0d';
    } else if (volume <= 400) {
      backgroundColor = `linear-gradient(to right, #00ffd8, #ff980e)`;
      textColor = '#0c0c0d';
    } else {
      backgroundColor = `linear-gradient(to right, #ff980e, #ff0039)`;
      textColor = 'white';
    }
    
    volumeValueContainer.style.background = backgroundColor;
    volumeValue.style.color = textColor;
  }

  // Show status message
  function showStatus(message, duration = 2000) {
    statusMessage.textContent = message;
    setTimeout(() => {
      statusMessage.textContent = '';
    }, duration);
  }

  // Get current tab information and set the slider to the current volume
  browser.tabs.query({active: true, currentWindow: true})
    .then(tabs => {
      if (tabs[0]) {
        browser.tabs.sendMessage(tabs[0].id, {action: "getVolume"})
          .then(response => {
            if (response && response.volume !== undefined) {
              const currentVolume = Math.round(response.volume * 100);
              updateVolumeUI(currentVolume);
            }
          })
          .catch(error => {
            console.error('Error getting volume:', error);
            showStatus('Error: Unable to get current volume');
          });
      }
    });

  // Update the displayed value when the slider changes
  volumeSlider.addEventListener('input', function() {
    updateVolumeUI(parseInt(this.value));
  });

  // Apply volume when the slider is released
  volumeSlider.addEventListener('change', function() {
    const volume = parseInt(this.value) / 100;
    applyVolumeToCurrentTab(volume);
    showStatus(`Volume set to ${this.value}%`);
  });

  // Preset buttons
  preset0.addEventListener('click', function() {
    updateVolumeUI(0);
    applyVolumeToCurrentTab(0);
    showStatus('Volume muted');
  });

  preset100.addEventListener('click', function() {
    updateVolumeUI(100);
    applyVolumeToCurrentTab(1);
    showStatus('Volume set to 100% (default)');
  });

  preset200.addEventListener('click', function() {
    updateVolumeUI(200);
    applyVolumeToCurrentTab(2);
    showStatus('Volume set to 200%');
  });

  preset500.addEventListener('click', function() {
    updateVolumeUI(500);
    applyVolumeToCurrentTab(5);
    showStatus('Volume set to 500% (maximum)');
  });

  // Apply to all tabs button
  applyToAllButton.addEventListener('click', function() {
    const volume = parseInt(volumeSlider.value) / 100;
    const volumePercent = parseInt(volumeSlider.value);
    
    browser.tabs.query({})
      .then(tabs => {
        let appliedCount = 0;
        let errorCount = 0;
        
        for (let tab of tabs) {
          browser.tabs.sendMessage(tab.id, {
            action: "setVolume",
            volume: volume
          }).then(() => {
            appliedCount++;
            if (appliedCount + errorCount === tabs.length) {
              showStatus(`Volume applied to ${appliedCount} tabs`);
            }
          }).catch(error => {
            // Some tabs might not have content scripts loaded
            errorCount++;
            console.log(`Could not set volume for tab ${tab.id}:`, error);
            if (appliedCount + errorCount === tabs.length) {
              showStatus(`Volume applied to ${appliedCount} tabs (${errorCount} skipped)`);
            }
          });
        }
      });
  });

  // Reset button
  resetButton.addEventListener('click', function() {
    updateVolumeUI(100);
    applyVolumeToCurrentTab(1);
    showStatus('Volume reset to default (100%)');
  });

  // Helper function to apply volume to the current tab
  function applyVolumeToCurrentTab(volume) {
    browser.tabs.query({active: true, currentWindow: true})
      .then(tabs => {
        if (tabs[0]) {
          browser.tabs.sendMessage(tabs[0].id, {
            action: "setVolume",
            volume: volume
          });
        }
      });
  }
});