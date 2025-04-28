// windowManager.js

class WindowManager {
  constructor(desktopId) {
    this.desktop = document.getElementById(desktopId);
    //taskbar
    this.taskbar = document.getElementById("taskbar");
    this.inactivityTimer = null;
    this.mouseMoved = this.resetInactivityTimer.bind(this);
    document.addEventListener("mousemove", this.mouseMoved);
    this.startInactivityTimer();

    this.windows = [];
    this.zIndexCounter = 10;
    this.focusedWindow = null;

    this.loadState();
    window.addEventListener("resize", () => this.clampAllWindows());
    window.addEventListener("beforeunload", () => this.saveState());
  }

  startInactivityTimer() {
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
    this.inactivityTimer = setTimeout(() => {
      this.hideTaskbar();
    }, 5000);
  }

  resetInactivityTimer() {
    this.showTaskbar();
    this.startInactivityTimer();
  }

  hideTaskbar() {
    this.taskbar.classList.add("taskbar-hidden");
  }

  showTaskbar() {
    this.taskbar.classList.remove("taskbar-hidden");
  }

  //taskbar method
  addToTaskbar(win) {
    // Create the wrapper for button and tooltip
    const wrapper = document.createElement("div");
    wrapper.className = "taskbar-btn-wrapper";

    // Create the taskbar button
    const btn = document.createElement("button");
    btn.className = "taskbar-btn px-1 py-1 rounded taskbar-hover";
    btn.dataset.winId = win.dataset.id;

    // Create the icon
    const icon = document.createElement("img");
    icon.className = "taskbar-icon";
    icon.alt = win.dataset.appType;
    icon.style.width = "24px";
    icon.style.height = "24px";

    // Set the icon source based on the app type
    switch (win.dataset.appType) {
      case "note":
        icon.src = localStorage.getItem("icon_note") || "assets/note.svg";
        break;
      case "terminal":
        icon.src =
          localStorage.getItem("icon_terminal") || "assets/terminal.svg";
        break;
      case "settings":
        icon.src =
          localStorage.getItem("icon_settings") || "assets/settings.svg";
        break;
      default:
        icon.src = "assets/default.png";
        break;
    }

    // Append icon to button
    btn.appendChild(icon);

    // Create the tooltip
    const tooltip = document.createElement("span");
    tooltip.className = "tooltip";
    tooltip.textContent =
      win.dataset.appType.charAt(0).toUpperCase() +
      win.dataset.appType.slice(1);

    // Append both to the wrapper
    wrapper.appendChild(btn);
    wrapper.appendChild(tooltip);

    // Button click behavior
    btn.onclick = () => {
      if (win.classList.contains("minimized")) {
        win.classList.remove("minimized");
        win.style.display = "block";
        this.focusWindow(win);
      } else {
        win.classList.add("minimized");
        win.style.display = "none";
      }
    };

    // Store reference and add to taskbar
    win._taskbarWrapper = wrapper;
    this.taskbar.appendChild(wrapper);
  }

  createWindow(appType, initialContent = "", sessionId = null) {
    const winId = sessionId || "win_" + Date.now();

    const win = document.createElement("div");
    win.className = "window";
    win.style.zIndex = this.zIndexCounter++;
    win.style.left = "60px";
    win.style.top = "60px";
    win.dataset.appType = appType;
    win.dataset.id = winId;

    if (!sessionId && appType === "terminal") {
      // Only generate if not restoring
      sessionId =
        "sess_" + Date.now() + "_" + Math.random().toString(36).substring(2);
    }
    win.dataset.sessionId = sessionId;

    win.innerHTML = `
            <div class="window-header">
                <div class="buttons">
                    <span class="btn red close"></span>
                    <span class="btn yellow minimize"></span>
                    <span class="btn green maximize"></span>
                </div>
                <div class="title">${appType}</div>
            </div>
            <div class="window-content"></div>
        `;

    const handles = ["top", "right", "bottom", "left"];
    handles.forEach((pos) => {
      const handle = document.createElement("div");
      handle.className = `resize-handle ${pos}`;
      this.makeResizable(win, handle, pos);
      win.appendChild(handle);
    });

    const bottomRight = document.createElement("div");
    bottomRight.className = "resize-handle corner bottom-right";
    this.makeCornerResizable(win, bottomRight, "bottom-right");
    win.appendChild(bottomRight);

    const bottomLeft = document.createElement("div");
    bottomLeft.className = "resize-handle corner bottom-left";
    this.makeCornerResizable(win, bottomLeft, "bottom-left");
    win.appendChild(bottomLeft);

    const content = win.querySelector(".window-content");
    const closeBtn = win.querySelector(".close");
    closeBtn.onclick = () => this.removeWindow(win);

    this.makeDraggable(win);

    const DEFAULTS = {
      taskbarColor: "#424242",
      taskbarOpacity: "0.7",
      desktopBgColor: "#1e1e1e",
      bgOpacity: "0",
      bgSize: "cover",
      bgPosition: "center",
      bgRepeat: "no-repeat",
    };

    switch (appType) {
      case "note":
        content.innerHTML = `<div class="editor" style="height: 100%"></div>`;
        const quill = new Quill(content.firstChild, {
          theme: "snow",
          modules: {
            toolbar: [
              [{ font: [] }, { size: [] }],
              ["bold", "italic", "underline", "strike"],
              [{ color: [] }, { background: [] }],
              [{ script: "sub" }, { script: "super" }],
              [{ header: "1" }, { header: "2" }, "blockquote", "code-block"],
              [
                { list: "ordered" },
                { list: "bullet" },
                { indent: "-1" },
                { indent: "+1" },
              ],
              ["direction", { align: [] }],
              ["link", "image", "video"],
              ["clean"],
            ],
          },
        });
        if (initialContent) quill.root.innerHTML = initialContent;
        win._editor = quill;

        // Update the .window style for this specific case
        win.style.backgroundColor = "white";
        const saveBtn = document.createElement("button");
        saveBtn.innerText = "save |";
        saveBtn.className = "note-save-btn";
        saveBtn.style.position = "absolute";
        saveBtn.style.top = "5px";
        saveBtn.style.right = "55px";
        saveBtn.onclick = saveNotesToLocalStorage;
        content.appendChild(saveBtn);

        const noteId = win.dataset.id || `win_${Date.now()}`;
        const savedSettings = JSON.parse(
          localStorage.getItem("autosave_settings") || "{}"
        );
        let isAutosaveOn = savedSettings[noteId] || false;
        let autosaveInterval = null;

        // Create switch wrapper
        const switchWrapper = document.createElement("label");
        switchWrapper.className = "switch";
        switchWrapper.style.position = "absolute";
        switchWrapper.style.top = "7px";
        switchWrapper.style.left = "70px";
        switchWrapper.title = "Toggle Autosave";

        // Create checkbox input
        const switchInput = document.createElement("input");
        switchInput.type = "checkbox";
        switchInput.checked = isAutosaveOn;

        // Create slider span
        const switchSlider = document.createElement("span");
        switchSlider.className = "slider";

        // Append input and slider to the switch
        switchWrapper.appendChild(switchInput);
        switchWrapper.appendChild(switchSlider);
        content.appendChild(switchWrapper);

        function toggleAutosave(state) {
          const settings = JSON.parse(
            localStorage.getItem("autosave_settings") || "{}"
          );

          if (state) {
            autosaveInterval = setInterval(saveNotesToLocalStorage, 5000);
            showToast("Autosave enabled (every 5s)");
            settings[noteId] = true;
          } else {
            clearInterval(autosaveInterval);
            autosaveInterval = null;
            showToast("Autosave disabled");
            settings[noteId] = false;
          }

          localStorage.setItem("autosave_settings", JSON.stringify(settings));
        }

        switchInput.addEventListener("change", () => {
          isAutosaveOn = switchInput.checked;
          toggleAutosave(isAutosaveOn);
        });

        // Initialize autosave state
        if (isAutosaveOn) toggleAutosave(true);

        // Optional cleanup
        win.addEventListener("remove", () => {
          if (autosaveInterval) clearInterval(autosaveInterval);
        });

        function showToast(message) {
          const toast = document.createElement("div");
          toast.innerText = message;
          toast.className = "note-toast";
          Object.assign(toast.style, {
            position: "fixed",
            bottom: "30px",
            right: "30px",
            backgroundColor: "#333",
            color: "#fff",
            padding: "10px 20px",
            borderRadius: "8px",
            boxShadow: "0 0 10px rgba(0,0,0,0.3)",
            zIndex: 9999,
            opacity: 0,
            transition: "opacity 0.3s ease",
          });

          document.body.appendChild(toast);

          // Trigger fade-in
          requestAnimationFrame(() => {
            toast.style.opacity = 1;
          });

          // Fade out and remove
          setTimeout(() => {
            toast.style.opacity = 0;
            toast.addEventListener("transitionend", () => toast.remove());
          }, 2000);
        }

        function saveNotesToLocalStorage() {
          const notes = JSON.parse(localStorage.getItem("notes") || "[]");
          const updatedNotes = [];
          const existingIds = notes.map((n) => n.id);

          document
            .querySelectorAll('.window[data-app-type="note"]')
            .forEach((note) => {
              let id = note.dataset.id;
              const editor = note._editor;
              const content = editor?.root.innerHTML || "";

              const isNew = !id || id.startsWith("win_");

              if (isNew) {
                const defaultName = `Note_${Date.now()}`;
                id =
                  prompt("Enter a name for this note:", defaultName) ||
                  defaultName;
                note.dataset.id = id;
              }

              updatedNotes.push({ id, content });

              let icon = document.getElementById(`icon-${id}`);
              if (!icon) {
                icon = document.createElement("div");
                icon.className = "icon";
                icon.id = `icon-${id}`;
                icon.innerHTML = `
                            <img src="${
                              localStorage.getItem("icon_note") ||
                              "assets/note-save.svg"
                            }" alt="Note Icon" draggable="false" />
                            <span>${id}</span>
                            `;
                icon.style.position = "absolute";
                icon.style.left = `${Math.random() * 80}px`;
                icon.style.top = `${Math.random() * 80}px`;

                document.getElementById("desktop").appendChild(icon);
              }

              icon.dataset.noteContent = content;
              icon.ondblclick = () => {
                wm.createWindow("note", content, id);
              };

              // Show toast depending on new or updated
              if (isNew || !existingIds.includes(id)) {
                showToast(`Note "${id}" saved`);
              } else {
                showToast(`Note "${id}" updated`);
              }
            });

          // Add remaining notes from desktop icons
          document.querySelectorAll('.icon[id^="icon-"]').forEach((icon) => {
            const id = icon.id.replace("icon-", "");
            const content = icon.dataset.noteContent || "";
            if (!updatedNotes.find((n) => n.id === id)) {
              updatedNotes.push({ id, content });
            }
          });

          localStorage.setItem("notes", JSON.stringify(updatedNotes));
        }

        // Handle Ctrl+S or Cmd+S to save the note
        win.tabIndex = 0;
        win.addEventListener("keydown", function (e) {
          if ((e.ctrlKey || e.metaKey) && e.key === "s") {
            e.preventDefault(); // Prevent browser's default save dialog
            saveNotesToLocalStorage();
          }
        });

        break;

      case "terminal":
        let sessionId = win.dataset.sessionId;
        if (!sessionId) {
          // If no session ID exists, generate and save one
          sessionId =
            "sess_" +
            Date.now() +
            "_" +
            Math.random().toString(36).substring(2);
          win.dataset.sessionId = sessionId;
        }

        const terminalDiv = document.createElement("div");
        terminalDiv.style.height = "100%";
        content.appendChild(terminalDiv);
        const terminal = new Terminal({
          theme: {
            background: "#1e1e1e", // Dark background
            foreground: "#d4d4d4", // Light text
            cursor: "#ffffff",
            selection: "#666666",
            black: "#000000",
            red: "#cd3131",
            green: "#0dbc79",
            yellow: "#e5e510",
            blue: "#2472c8",
            magenta: "#bc3fbc",
            cyan: "#11a8cd",
            white: "#e5e5e5",
            brightBlack: "#666666",
            brightRed: "#f14c4c",
            brightGreen: "#23d18b",
            brightYellow: "#f5f543",
            brightBlue: "#3b8eea",
            brightMagenta: "#d670d6",
            brightCyan: "#29b8db",
            brightWhite: "#e5e5e5",
          },
          fontFamily: "monospace",
          fontSize: 14,
          cursorStyle: "block",
          cursorBlink: true,
          disableStdin: false,
          scrollback: 1000,
        });

        const fitAddon = new FitAddon.FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.open(terminalDiv);
        fitAddon.fit();

        const socket = new WebSocket("ws://" + location.host);

        socket.onopen = () => {
          socket.send(JSON.stringify({ type: "init", sessionId }));
        };

        socket.onmessage = (event) => {
          const msg = JSON.parse(event.data);
          if (msg.type === "data") {
            terminal.write(msg.data);
          }
        };

        terminal.onData((data) => {
          socket.send(JSON.stringify({ type: "input", data }));
        });

        new ResizeObserver(() => fitAddon.fit()).observe(terminalDiv);

        win._terminal = terminal;
        win._sessionId = sessionId;
        break;

      case "settings":
        content.innerHTML = `
            
                    <div class="settings-tabs">
                        <button data-tab="appearance" class="active">Appearance</button>
                        <button data-tab="background">Background</button>
                        <button data-tab="icons">Icons</button>
                    </div>
            
                    <div class="settings-panel appearance-panel active">
                        <div class="settings-option">
                            <label>Taskbar Color:</label>
                            <input class="color-picker" type="color" id="taskbar-color-picker">
                            <button id="reset-taskbar-color">Reset</button>
                        </div>

                        <div class="settings-option">
                            <label>Taskbar Opacity:</label>
                            <input type="range" id="taskbar-opacity-slider" min="0" max="1" step="0.01">
                            <span id="taskbar-opacity-value"></span>
                        </div>

                        <div class="settings-option">
                            <label>
                                <input type="checkbox" id="taskbar-shadow-toggle">
                                Enable Taskbar Shadow
                            </label>
                        </div>

                        <div class="settings-option">
                            <button id="export-settings">Export Desktop</button>
                            <input type="file" id="import-settings" accept=".json" style="display:none;">
                            <button id="import-settings-btn">Import Desktop</button>
                        </div>


                    </div>
            
                    <div class="settings-panel background-panel">
                        <div class="settings-option">
                            <label>Desktop Background Color:</label>
                            <input class="color-picker" type="color" id="desktop-bg-color-picker">
                            <button id="reset-desktop-bg">Reset</button>
                        </div>
                        
                        <div class="settings-option">
                            <label>Background Image:</label>
                            <input type="file" id="desktop-bg-image-picker" accept="image/*">
                            <button id="remove-bg-image">Remove</button>
                        </div>

                        <div class="settings-option">
                            <label>Background Image Opacity:</label>
                            <input type="range" id="bg-opacity-slider" min="0" max="1" step="0.01">
                            <span id="bg-opacity-value"></span>
                            <button id="reset-bg-opacity">Reset Opacity</button>
                        </div>

                        <div class="settings-bgpos-wrapper">
                            <div class="settings-option">
                                <label>Size:</label>
                                <select id="bg-size-select">
                                    <option value="cover">Cover</option>
                                    <option value="contain">Contain</option>
                                    <option value="auto">Auto</option>
                                </select>
                            </div>

                            <div class="settings-option">
                                <label>Position:</label>
                                <select id="bg-position-select">
                                    <option value="center">Center</option>
                                    <option value="top left">Top Left</option>
                                    <option value="top right">Top Right</option>
                                    <option value="bottom left">Bottom Left</option>
                                    <option value="bottom right">Bottom Right</option>
                                </select>
                            </div>

                            <div class="settings-option">
                                <label>Behavior:</label>
                                <select id="bg-repeat-select">
                                    <option value="no-repeat">No Repeat</option>
                                    <option value="repeat">Tile</option>
                                    <option value="repeat-x">Tile X</option>
                                    <option value="repeat-y">Tile Y</option>
                                </select>
                            </div>

                            <button id="reset-bg-style">Reset</button>
                        </div>
                        

                    </div>

                    <div class="settings-panel icons-panel">
                        <div class="settings-option">
                            <label>Note Icon:</label>
                            <input type="file" id="note-icon-picker" accept="image/*">
                            <button id="reset-note-icon">Reset</button>
                        </div>
                        <div class="settings-option">
                            <label>Terminal Icon:</label>
                            <input type="file" id="terminal-icon-picker" accept="image/*">
                            <button id="reset-terminal-icon">Reset</button>
                        </div>
                        <div class="settings-option">
                            <label>Settings Icon:</label>
                            <input type="file" id="settings-icon-picker" accept="image/*">
                            <button id="reset-settings-icon">Reset</button>
                        </div>
                    </div>
                `;

        const desktop = document.getElementById("desktop");
        const taskbar = document.getElementById("taskbar");

        // Tabs
        const tabButtons = content.querySelectorAll(".settings-tabs button");
        const panels = content.querySelectorAll(".settings-panel");

        tabButtons.forEach((btn) => {
          btn.onclick = () => {
            tabButtons.forEach((b) => b.classList.remove("active"));
            panels.forEach((p) => p.classList.remove("active"));

            btn.classList.add("active");
            const tab = btn.dataset.tab;
            localStorage.setItem("activeSettingsTab", tab); // 🔹 Save selected tab
            content.querySelector(`.${tab}-panel`).classList.add("active");
          };
        });

        // Inputs
        const taskbarColorPicker = content.querySelector(
          "#taskbar-color-picker"
        );
        const desktopBgColorPicker = content.querySelector(
          "#desktop-bg-color-picker"
        );
        const bgImagePicker = content.querySelector("#desktop-bg-image-picker");

        const savedTaskbarColor =
          localStorage.getItem("taskbarColor") || DEFAULTS.taskbarColor;
        const savedDesktopBgColor =
          localStorage.getItem("desktopBgColor") || DEFAULTS.desktopBgColor;
        const savedBgImage = localStorage.getItem("desktopBgImage");

        taskbarColorPicker.value = savedTaskbarColor;
        desktopBgColorPicker.value = savedDesktopBgColor;

        taskbar.style.backgroundColor = savedTaskbarColor;
        desktop.style.backgroundColor = savedDesktopBgColor;

        if (savedBgImage) {
          desktop.style.backgroundImage = `url(${savedBgImage})`;
          desktop.style.backgroundSize = "cover";
          desktop.style.backgroundPosition = "center";
        }

        // TASKBAR OPACITY
        const taskbarOpacitySlider = content.querySelector(
          "#taskbar-opacity-slider"
        );
        const taskbarOpacityValue = content.querySelector(
          "#taskbar-opacity-value"
        );

        const savedTaskbarOpacity =
          parseFloat(localStorage.getItem("taskbarOpacity")) ??
          DEFAULTS.taskbarOpacity;
        taskbarOpacitySlider.value = savedTaskbarOpacity;
        taskbarOpacityValue.textContent = savedTaskbarOpacity;

        function applyTaskbarStyle(color, opacity) {
          // Convert hex to rgba
          const hex = color.replace("#", "");
          const r = parseInt(hex.substring(0, 2), 16);
          const g = parseInt(hex.substring(2, 4), 16);
          const b = parseInt(hex.substring(4, 6), 16);
          taskbar.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${opacity})`;
        }

        applyTaskbarStyle(savedTaskbarColor, savedTaskbarOpacity);

        // TASKBAR SHADOW
        const shadowToggle = content.querySelector("#taskbar-shadow-toggle");

        shadowToggle.checked = localStorage.getItem("taskbarShadow") === "true";

        shadowToggle.onchange = (e) => {
          const enabled = e.target.checked;
          localStorage.setItem("taskbarShadow", enabled);
          taskbar.style.boxShadow = enabled
            ? "0 -2px 5px rgba(0, 0, 0, 0.5)"
            : "none";
        };

        // Events
        taskbarColorPicker.oninput = (e) => {
          const color = e.target.value;
          const opacity = parseFloat(taskbarOpacitySlider.value);
          localStorage.setItem("taskbarColor", color);
          applyTaskbarStyle(color, opacity);
        };

        taskbarOpacitySlider.oninput = (e) => {
          const opacity = parseFloat(e.target.value);
          taskbarOpacityValue.textContent = opacity.toFixed(2);
          localStorage.setItem("taskbarOpacity", opacity);
          const color = taskbarColorPicker.value;
          applyTaskbarStyle(color, opacity);
        };

        // BACKGROUND OPACITY (new element infront the bg image)
        const bgOverlay = document.getElementById("background-overlay");
        const bgOpacitySlider = content.querySelector("#bg-opacity-slider");
        const bgOpacityValue = content.querySelector("#bg-opacity-value");

        const savedBgOpacity =
          parseFloat(localStorage.getItem("bgOpacity")) ?? 0;
        bgOverlay.style.opacity = savedBgOpacity;
        bgOpacitySlider.value = savedBgOpacity;
        bgOpacityValue.textContent = savedBgOpacity;

        bgOpacitySlider.oninput = (e) => {
          const opacity = parseFloat(e.target.value);
          bgOverlay.style.opacity = opacity;
          bgOpacityValue.textContent = opacity.toFixed(2);
          localStorage.setItem("bgOpacity", opacity);
        };

        content.querySelector("#reset-bg-opacity").onclick = () => {
          bgOverlay.style.opacity = 0;
          bgOpacitySlider.value = 0;
          bgOpacityValue.textContent = "0";
          localStorage.setItem("bgOpacity", DEFAULTS.bgOpacity);
        };

        desktopBgColorPicker.oninput = (e) => {
          const color = e.target.value;
          desktop.style.backgroundColor = color;
          localStorage.setItem("desktopBgColor", color);
        };

        bgImagePicker.onchange = (e) => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = function (event) {
              const imageUrl = event.target.result;
              desktop.style.backgroundImage = `url(${imageUrl})`;
              desktop.style.backgroundSize = "cover";
              desktop.style.backgroundPosition = "center";
              localStorage.setItem("desktopBgImage", imageUrl);
            };
            reader.readAsDataURL(file);
          }
        };

        content.querySelector("#remove-bg-image").onclick = () => {
          desktop.style.backgroundImage = "";
          localStorage.removeItem("desktopBgImage");
        };

        // Reset buttons
        content.querySelector("#reset-taskbar-color").onclick = () => {
          taskbarColorPicker.value = DEFAULTS.taskbarColor;
          taskbar.style.backgroundColor = DEFAULTS.taskbarColor;
          taskbarOpacitySlider.value = 0.7;
          taskbarOpacityValue.textContent = "0.7";
          localStorage.setItem("taskbarColor", DEFAULTS.taskbarColor);
          localStorage.setItem("taskbarOpacity", DEFAULTS.taskbarOpacity);
          applyTaskbarStyle(DEFAULTS.taskbarColor, DEFAULTS.taskbarOpacity);
        };

        content.querySelector("#reset-desktop-bg").onclick = () => {
          desktopBgColorPicker.value = DEFAULTS.desktopBgColor;
          desktop.style.backgroundColor = DEFAULTS.desktopBgColor;
          localStorage.setItem("desktopBgColor", DEFAULTS.desktopBgColor);
        };

        function handleIconUpload(inputId, storageKey, defaultSrc) {
          const input = content.querySelector(`#${inputId}`);
          input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
              localStorage.setItem(storageKey, event.target.result);
              updateAllIcons();
            };
            reader.readAsDataURL(file);
          };
        }

        function handleIconReset(btnId, storageKey) {
          content.querySelector(`#${btnId}`).onclick = () => {
            localStorage.removeItem(storageKey);
            updateAllIcons();
          };
        }

        const bgSizeSelect = content.querySelector("#bg-size-select");
        const bgPositionSelect = content.querySelector("#bg-position-select");
        const bgRepeatSelect = content.querySelector("#bg-repeat-select");

        // Load saved settings
        bgSizeSelect.value = localStorage.getItem("bgSize") || "cover";
        bgPositionSelect.value = localStorage.getItem("bgPosition") || "center";
        bgRepeatSelect.value = localStorage.getItem("bgRepeat") || "no-repeat";

        // Apply them
        desktop.style.backgroundSize = bgSizeSelect.value;
        desktop.style.backgroundPosition = bgPositionSelect.value;
        desktop.style.backgroundRepeat = bgRepeatSelect.value;

        // Save on change
        bgSizeSelect.onchange = (e) => {
          desktop.style.backgroundSize = e.target.value;
          localStorage.setItem("bgSize", e.target.value);
        };

        bgPositionSelect.onchange = (e) => {
          desktop.style.backgroundPosition = e.target.value;
          localStorage.setItem("bgPosition", e.target.value);
        };

        bgRepeatSelect.onchange = (e) => {
          desktop.style.backgroundRepeat = e.target.value;
          localStorage.setItem("bgRepeat", e.target.value);
        };

        // Setup listeners
        handleIconUpload("note-icon-picker", "icon_note");
        handleIconUpload("terminal-icon-picker", "icon_terminal");
        handleIconUpload("settings-icon-picker", "icon_settings");

        handleIconReset("reset-note-icon", "icon_note");
        handleIconReset("reset-terminal-icon", "icon_terminal");
        handleIconReset("reset-settings-icon", "icon_settings");

        // Restore last active tab
        const savedTab =
          localStorage.getItem("activeSettingsTab") || "appearance";
        tabButtons.forEach((b) => b.classList.remove("active"));
        panels.forEach((p) => p.classList.remove("active"));

        const activeBtn = content.querySelector(
          `.settings-tabs button[data-tab="${savedTab}"]`
        );
        const activePanel = content.querySelector(`.${savedTab}-panel`);

        if (activeBtn && activePanel) {
          activeBtn.classList.add("active");
          activePanel.classList.add("active");
        }

        // EXPORT SETTINGS
        content.querySelector("#export-settings").onclick = () => {
          const data = JSON.stringify(localStorage);
          const blob = new Blob([data], { type: "application/json" });
          const url = URL.createObjectURL(blob);

          const a = document.createElement("a");
          a.href = url;
          a.download = "desktop-settings.json";
          a.click();

          URL.revokeObjectURL(url);
        };

        // IMPORT SETTINGS
        const importInput = content.querySelector("#import-settings");
        const importButton = content.querySelector("#import-settings-btn");

        importButton.onclick = () => {
          importInput.click();
        };

        importInput.onchange = (e) => {
          const file = e.target.files[0];
          if (!file) return;

          const reader = new FileReader();
          reader.onload = function (event) {
            try {
              const importedData = JSON.parse(event.target.result);

              // Clear existing settings (optional, or you can merge)
              localStorage.clear();

              for (const key in importedData) {
                localStorage.setItem(key, importedData[key]);
              }

              alert("Settings imported! Reloading to apply changes...");
              location.reload();
            } catch (err) {
              alert("Invalid settings file.");
            }
          };
          reader.readAsText(file);
        };

        break;
    }

    win.onclick = () => this.focusWindow(win);

    this.desktop.appendChild(win);
    win.style.display = "block";
    this.windows.push(win);
    this.focusWindow(win);
    //taskbar
    this.addToTaskbar(win);

    //MINIMIZE MAXIMIZE
    const minimizeBtn = win.querySelector(".minimize");
    const maximizeBtn = win.querySelector(".maximize");

    // Minimize button logic
    minimizeBtn.onclick = () => {
      win.classList.add("minimized");
      win.style.display = "none";
    };

    // Maximize / Restore toggle
    let isMaximized = false;
    let prevState = {};

    maximizeBtn.onclick = () => {
      if (!win._isMaximized) {
        win._prevState = {
          left: win.style.left,
          top: win.style.top,
          width: win.style.width,
          height: win.style.height,
        };

        win.style.left = "0";
        win.style.top = "0";
        win.style.width = "100%";
        win.style.height = "100%";
        win.classList.add("maximized");
      } else {
        const prev = win._prevState || {};
        win.style.left = prev.left || "60px";
        win.style.top = prev.top || "60px";
        win.style.width = prev.width || "";
        win.style.height = prev.height || "";
        win.classList.remove("maximized");
      }

      win._isMaximized = !win._isMaximized;
    };

    win._isMaximized = false;
  }

  makeResizable(win, handle, direction) {
    let isResizing = false;

    const onStart = (e) => {
      e.preventDefault();
      isResizing = true;
      const { x: startX, y: startY } = getClientPos(e);
      const startWidth = parseInt(getComputedStyle(win).width, 10);
      const startHeight = parseInt(getComputedStyle(win).height, 10);
      const startLeft = win.offsetLeft;
      const startTop = win.offsetTop;

      const onMove = (e) => {
        if (!isResizing) return;
        const { x, y } = getClientPos(e);
        if (direction === "right") {
          win.style.width = startWidth + x - startX + "px";
        } else if (direction === "left") {
          const newWidth = startWidth - (x - startX);
          if (newWidth > 150) {
            win.style.width = newWidth + "px";
            win.style.left = startLeft + x - startX + "px";
          }
        } else if (direction === "bottom") {
          win.style.height = startHeight + y - startY + "px";
        } else if (direction === "top") {
          const newHeight = startHeight - (y - startY);
          if (newHeight > 100) {
            win.style.height = newHeight + "px";
            win.style.top = startTop + y - startY + "px";
          }
        }
      };

      const onEnd = () => {
        isResizing = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onEnd);
        document.removeEventListener("touchmove", onMove);
        document.removeEventListener("touchend", onEnd);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onEnd);
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", onEnd);
    };

    handle.addEventListener("mousedown", onStart);
    handle.addEventListener("touchstart", onStart, { passive: false });
  }

  makeCornerResizable(win, handle, corner) {
    let isResizing = false;

    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      isResizing = true;
      const startX = e.clientX;
      const startY = e.clientY;
      const startWidth = parseInt(
        document.defaultView.getComputedStyle(win).width,
        10
      );
      const startHeight = parseInt(
        document.defaultView.getComputedStyle(win).height,
        10
      );
      const startLeft = win.offsetLeft;

      const doDrag = (e) => {
        if (!isResizing) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        if (corner === "bottom-right") {
          win.style.width = startWidth + dx + "px";
          win.style.height = startHeight + dy + "px";
        } else if (corner === "bottom-left") {
          const newWidth = startWidth - dx;
          if (newWidth > 150) {
            win.style.width = newWidth + "px";
            win.style.left = startLeft + dx + "px";
          }
          win.style.height = startHeight + dy + "px";
        }
      };

      const stopDrag = () => {
        isResizing = false;
        document.removeEventListener("mousemove", doDrag);
        document.removeEventListener("mouseup", stopDrag);
      };

      document.addEventListener("mousemove", doDrag);
      document.addEventListener("mouseup", stopDrag);
    });
  }

  makeDraggable(win) {
    const header = win.querySelector(".window-header");
    let offsetX = 0,
      offsetY = 0;
    let isDragging = false;

    const onStart = (e) => {
      isDragging = true;

      const { x, y } = getClientPos(e);

      if (win.classList.contains("maximized")) {
        const prevState = win._prevState || {
          left: "60px",
          top: "60px",
          width: "",
          height: "",
        };
        const rect = win.getBoundingClientRect();
        const percentX = x / rect.width;
        const newWidth = parseInt(prevState.width) || 600;
        const newLeft = x - percentX * newWidth;
        win.style.left = `${newLeft}px`;
        win.style.top = "60px";
        win.style.width = prevState.width;
        win.style.height = prevState.height;
        win.classList.remove("maximized");
        win._isMaximized = false;
      }

      offsetX = x - win.offsetLeft;
      offsetY = y - win.offsetTop;
    };

    const onMove = (e) => {
      if (isDragging) {
        const { x, y } = getClientPos(e);
        win.style.left = `${x - offsetX}px`;
        win.style.top = `${y - offsetY}px`;
      }
    };

    const onEnd = () => {
      if (isDragging) {
        isDragging = false;
        let left = win.offsetLeft;
        let top = win.offsetTop;
        win.style.left = Math.max(0, left) + "px";
        win.style.top = Math.max(0, top) + "px";
      }
    };

    header.addEventListener("mousedown", onStart);
    header.addEventListener("touchstart", onStart, { passive: false });

    document.addEventListener("mousemove", onMove);
    document.addEventListener("touchmove", onMove, { passive: false });

    document.addEventListener("mouseup", onEnd);
    document.addEventListener("touchend", onEnd);
  }

  removeWindow(win) {
    this.windows = this.windows.filter((w) => w !== win);
    this.taskbar.removeChild(win._taskbarWrapper);
    win.remove();
  }

  focusWindow(win) {
    this.windows.forEach((w) => (w.style.zIndex = 10));
    win.style.zIndex = this.zIndexCounter++;
    this.focusedWindow = win;

    // Highlight taskbar icon
    this.windows.forEach((w) => {
      if (w._taskbarWrapper) {
        w._taskbarWrapper
          .querySelector("button")
          .classList.remove("active-taskbar-btn");
      }
    });
    if (win._taskbarWrapper) {
      win._taskbarWrapper
        .querySelector("button")
        .classList.add("active-taskbar-btn");
    }
  }

  getFocusedTerminal() {
    return this.focusedWindow?.dataset.appType === "terminal"
      ? this.focusedWindow._terminal
      : null;
  }

  saveState() {
    const state = this.windows.map((w) => {
      return {
        id: w.dataset.id,
        type: w.dataset.appType,
        left: w.style.left,
        top: w.style.top,
        width: w.style.width,
        height: w.style.height,
        content: w._editor?.root.innerHTML || "",
        sessionId: w._sessionId || null,
      };
    });

    localStorage.setItem("desktop-windows", JSON.stringify(state));
  }

  clampAllWindows() {
    this.windows.forEach((win) => {
      let left = win.offsetLeft;
      let top = win.offsetTop;

      if (left < 0) left = 0;
      if (top < 0) top = 0;

      win.style.left = left + "px";
      win.style.top = top + "px";
    });
  }

  loadState() {
    const raw = localStorage.getItem("desktop-windows");
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      saved.forEach((w) => this.createWindow(w.type, w.content, w.sessionId));
      this.windows.forEach((w, i) => {
        const state = saved[i];
        let left = parseInt(state.left, 10);
        let top = parseInt(state.top, 10);

        // Clamp only to top and left edges
        if (left < 0) left = 0;
        if (top < 0) top = 0;

        w.style.left = left + "px";
        w.style.top = top + "px";
        if (state.width) w.style.width = state.width;
        if (state.height) w.style.height = state.height;
      });
    } catch (e) {
      console.error("Failed to restore windows:", e);
    }
  }
}

function getClientPos(e) {
  if (e.touches && e.touches.length > 0) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  } else {
    return { x: e.clientX, y: e.clientY };
  }
}

// Usage Example (in your main script):
// const wm = new WindowManager('desktop');
// document.getElementById('note-icon').ondblclick = () => wm.createWindow('note');
// document.getElementById('terminal-icon').ondblclick = () => wm.createWindow('terminal');
