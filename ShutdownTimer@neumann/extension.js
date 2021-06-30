/**
    AUTHOR: Daniel Neumann
    GJS SOURCES: https://github.com/GNOME/gnome-shell/
    COMPILING SCHEMAS: glib-compile-schemas schemas/
    EDIT LOCALE: e.g. use Poedit and open ShutdownTimer.po files
    COMPILING LOCALE: msgfmt ShutdownTimer.po -o ShutdownTimer.mo
**/

/* IMPORTS */
const {GLib, St, Gio, Clutter} = imports.gi;

// screen and main functionality
const Main = imports.ui.main;


// menu items
const PopupMenu = imports.ui.popupMenu;
const Slider = imports.ui.slider;
const Switcher = imports.ui.switcherPopup;
const PadOsd = imports.ui.padOsd;

// translations
const Gettext = imports.gettext.domain('ShutdownTimer');
const _ = Gettext.gettext;


// import own scripts
const ExtensionUtils = imports.misc.extensionUtils;
const Extension = ExtensionUtils.getCurrentExtension();
const RootMode = Extension.imports.rootmode;
const Timer = Extension.imports.timer;
const Convenience = Extension.imports.convenience;


/* GLOBAL VARIABLES */
let textbox, submenu, slider, switcher, switcherSettingsButton, separator, settings, checkCancel, rootMode, displayedInfo, internalScheduleInfo, externalScheduleInfo, settingsHandlerIds;
const MODE_LABELS = Extension.imports.prefs.MODE_LABELS;
const MODE_TEXTS = {suspend: _("suspend"), poweroff: _("shutdown"), reboot: _("reboot")};

class ScheduleInfo {
    constructor({mode = '?', deadline = -1, external = false}) {
        this._v = {mode, deadline, external};
    }

    copy(vals) {
        return new ScheduleInfo({...this._v, ...vals})
    }

    get deadline() {
        return this._v.deadline;
    }

    get external() {
        return this._v.external;
    }

    get mode() {
        return this._v.mode;
    }

    get scheduled() {
        return this.deadline > -1;
    }

    get secondsLeft() {
        return this.deadline - GLib.DateTime.new_now_utc().to_unix();
    }

    get minutes() {
        return Math.floor(this.secondsLeft/60);
    }

    get modeText() {
        return this.mode in MODE_TEXTS ? MODE_TEXTS[this.mode] : MODE_TEXTS['poweroff'];
    }

    get label() {
        let label = _("Shutdown Timer");
        if (this.scheduled) {
            label = `${this.minutes} ${_("min until")} ${this.modeText}` + (this.external ? ' '+_("(sys)") : '');
        }
        return label;
    }

    changedMoreThanAMinute(otherInfo) {
        return this.mode !== otherInfo.mode ||
            this.scheduled !== otherInfo.scheduled ||
            this.external !== otherInfo.external ||
            this.minutes < otherInfo.minutes;
    }

    isMoreUrgendThan(otherInfo) {
        return !otherInfo.scheduled ||
            (this.scheduled && this.secondsLeft < otherInfo.secondsLeft);
    }
}


/* ACTION FUNCTIONS */
// show textbox with message
function _showTextbox(textmsg) {
    if(!textbox) {
        textbox = new St.Label({ style_class: 'textbox-label', text: "Hello, world!" });
        Main.uiGroup.add_actor(textbox);
    }
    textbox.text = textmsg;
    textbox.opacity = 255;
    let monitor = Main.layoutManager.primaryMonitor;
    textbox.set_position(Math.floor(monitor.width / 2 - textbox.width / 2),
                      Math.floor(monitor.height / 2 - textbox.height / 2));
    textbox.ease ({
        opacity: 0,
        delay: 3000,
        duration: 1000,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        onComplete: _hideTextbox
    });
}

function _hideTextbox() {
    Main.uiGroup.remove_actor(textbox);
    textbox = null;
}

function _getTimerStartValue() {
    let sliderValue = settings.get_int('slider-value') / 100.0;
    return Math.floor(sliderValue * settings.get_int('max-timer-value'));
}

// update timer value if slider has changed
function _updateSlider() {
    slider.value = settings.get_int('slider-value') / 100.0;
    _updateSwitchLabel();
}

function _updateSwitchLabel() {
    let label = `${_getTimerStartValue()} ${_("min")}`;
    if (settings.get_boolean('root-mode-value')) {
        label += ' ' + _("(root)");
    }
    switcher.label.text = label;
}

function _onRootModeChanged() {
    if (!settings.get_boolean('root-mode-value')) {
        rootMode.stopRootProc();
    }
    _updateSwitchLabel();
    Promise.all([maybeStopRootModeProtection(), maybeStartRootModeProtection()])
        .then(() => {
            if (!settings.get_boolean('root-mode-value')) {
                rootMode.updateScheduleInfo();
            }
        });
}

function _onModeChange() {
    // redo Root-mode protection
    maybeStopRootModeProtection(true)
        .then(() => {
            _updateCurrentMode();
            _updateSelectedModeItems();
        })
        .then(() => maybeStartRootModeProtection());
}

function _onShowSettingsButtonChanged() {
    switcherSettingsButton.visible = settings.get_boolean('show-settings-value');
}

function maybeCheckCmdString(nl=false) {
    const cmd = settings.get_string('check-command-value');
    return (settings.get_boolean('enable-check-command-value') && cmd !== '') ?  (nl ? '\n' : '')  + cmd : '';
}

function _updateCheckCommandState() {

    if (checkCancel !== null) {
        // check command is running
        if(internalScheduleInfo.scheduled) {
            submenu.label.text = _("Waiting for confirmation");
            showText = _("Waiting for confirmation") + maybeCheckCmdString(true);
        } else {
            submenu.label.text = _("Shutdown Timer");
        }
        _showTextbox(showText);
    }
}

// toggle button starts/stops shutdown timer
function _onToggle() {
    if (switcher.state) {
        // start shutdown timer
        startSchedule();
    } else {
        // stop shutdown timer
        stopSchedule();
    }
}

function stopSchedule(show = false) {
    settings.set_int('shutdown-timestamp-value', -1);
    let showText = _("Shutdown Timer stopped");
    if (checkCancel !== null) {
        checkCancel.cancel();
        showText = _("Confirmation canceled");
        submenu.label.text = _("Shutdown Timer");
    }
    if (show) {
        _showTextbox(showText);
    }
}

function startSchedule() {
    const maxTimerMinutes = Math.floor(settings.get_int('slider-value') * settings.get_int('max-timer-value') / 100.0);
    settings.set_int('shutdown-timestamp-value', GLib.DateTime.new_now_utc().to_unix()+ maxTimerMinutes*60);
    _showTextbox(`${_("System will shutdown in")} ${_getTimerStartValue()} ${_("minutes")}${maybeCheckCmdString(true)}`);
}

async function maybeStopRootModeProtection(stopScheduled = false) {
    if ((stopScheduled || !internalScheduleInfo.scheduled) && settings.get_boolean('root-mode-value')) {
        log('Stop root mode protection for: ' + internalScheduleInfo.mode);
        try {
            switch (internalScheduleInfo.mode) {
                case 'poweroff':
                case 'reboot':
                    await rootMode.cancelShutdown();
                    rootMode.updateScheduleInfo();
                    break;
                default:
                    log('No root mode protection stopped for: ' + internalScheduleInfo.mode);
            }
        } catch (err) {
            _showTextbox(_("Root mode protection failed!") + '\n' + err);
            logErr(err, 'DisableRootModeProtection');
        }
    }
}

/**
 *
 * Insure that shutdown is executed even if the GLib timer fails by running
 * shutdown in rootMode delayed by 1 minute. Suspend is not insured.
 *
 */
async function maybeStartRootModeProtection() {
    if (internalScheduleInfo.scheduled && settings.get_boolean('root-mode-value')) {
        log('Start root mode protection for: ' + internalScheduleInfo.label);
        try {
            switch (internalScheduleInfo.mode) {
                case 'poweroff':
                    await rootMode.shutdown(internalScheduleInfo.minutes + 1);
                    break;
                case 'reboot':
                    await rootMode.shutdown(internalScheduleInfo.minutes + 1, true);
                    break;
                default:
                    log('No root mode protection started for: ' + internalScheduleInfo.mode);
            }
        } catch (err) {
            _showTextbox(_("Root mode protection failed!") + '\n' + err);
            logErr(err, 'EnableRootModeProtection');
        }
    }

}

// menu items switcher and slider
function _createSwitcherItem() {
    let switchMenuItem = new PopupMenu.PopupSwitchMenuItem('', internalScheduleInfo.scheduled);
    
    switchMenuItem.connect('toggled', _onToggle);

    switcherSettingsButton = new St.Button({reactive: true,
                                                can_focus: true,
                                                track_hover: true,
                                                accessible_name: _("Settings"),
                                                style_class: 'system-menu-action settings-button' });
    switcherSettingsButton.child = new St.Icon({icon_name: 'emblem-system-symbolic', 
                                                style_class: 'popup-menu-icon' });
    switcherSettingsButton.connect('clicked', () => {
            ExtensionUtils.openPrefs();
    });
    switchMenuItem.add_actor(switcherSettingsButton);
    _onShowSettingsButtonChanged();
    
    return switchMenuItem;
}

function _createSliderItem() {
    let sliderValue =  settings.get_int('slider-value') / 100.0;
    let sliderItem = new PopupMenu.PopupMenuItem('');
    let sliderIcon = new St.Icon({  icon_name: 'preferences-system-time-symbolic', 
                                    style_class: 'popup-menu-icon' });
    sliderItem.actor.add(sliderIcon);
    slider = new Slider.Slider(sliderValue);
    slider.connect('notify::value', () => {
        settings.set_int('slider-value', (slider.value * 100));
    });
    sliderItem.add_actor(slider);
    return sliderItem;
}

function _onInternalShutdownTimestampChanged() {
    internalScheduleInfo = internalScheduleInfo.copy({
        deadline: settings.get_int('shutdown-timestamp-value')
    });
    internalScheduleInfoTick();
}

function _updateShutdownInfo() {
    let displayInfo = externalScheduleInfo.isMoreUrgendThan(internalScheduleInfo) ?
        externalScheduleInfo : internalScheduleInfo;
    const updateSubmenu = displayInfo.changedMoreThanAMinute(displayedInfo);
    displayedInfo = displayInfo;

    if (updateSubmenu) {
        _updateSubmenuLabel();
    }
}

function internalScheduleInfoTick() {
    timer.adjustTo(internalScheduleInfo);
    _updateShutdownInfo();
}

function externalScheduleInfoTick(info) {
    externalScheduleInfo = externalScheduleInfo.copy({...info, scheduled: info.mode !== null});
    _updateShutdownInfo();
}

function _updateCurrentMode() {
    internalScheduleInfo = internalScheduleInfo.copy({mode: settings.get_string('shutdown-mode-value')});
    _updateShutdownInfo();
}

function _updateSubmenuLabel() {
    if (submenu) {
        submenu.label.text = displayedInfo.label;
    }
}

function _updateSelectedModeItems() {
    modeItems.forEach(([mode, item]) => {
        item.setOrnament(mode === internalScheduleInfo.mode ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
    });
}

function _updateShownModeItems() {
    const activeModes = settings.get_string('show-shutdown-mode-value').split(',')
        .map(s => s.trim().toLowerCase())
        .filter(s => s in MODE_LABELS);
    modeItems.forEach(([mode, item]) => {
        const position = activeModes.indexOf(mode);
        if (position > -1) {
            submenu.menu.moveMenuItem(item, position + 2);
        }
        item.visible = position > -1;
    });
}

function _startMode(mode) {
    settings.set_string('shutdown-mode-value', mode);
    startSchedule();
    _updateSwitcherState();
}

function _updateSwitcherState() {
    switcher.setToggleState(internalScheduleInfo.scheduled);
}

// timer action (shutdown/suspend)
function serveInernalSchedule() {
    maybeDoCheck()
        .then(() => {
            // check succeeded: do shutdown
            shutdown();
        })
        .catch((err) => {
            // check failed: cancel shutdown
            if (settings.get_boolean('root-mode-value')) {
                rootMode.cancelShutdown();
            }
            logError(err, 'CheckError');
        })
        .finally(() => {
            stopSchedule(false);
            _updateSwitcherState();
            _updateCheckCommandState();
        });
}

async function maybeDoCheck() {
    const checkCmd = maybeCheckCmdString();
    if (checkCmd === '') {
        return;
    }
    if (settings.get_boolean('root-mode-value') && settings.get_boolean('enable-root-mode-cancel-value')) {
        // avoid shutting down (with root mode protection) before check command is done
        rootMode.cancelShutdown();
    }
    if (checkCancel !== null) {
        _showTextbox(_("Confirmation canceled"));
        throw new Error('Confirmation canceled: attempted to start a second check command!');
    }
    checkCancel = new Gio.Cancellable();
    _updateCheckCommandState();
    return RootMode.execCheck(checkCmd, checkCancel)
        .then(() => {
            log(`Check command "${checkCmd}" confirmed shutdown.`);
            return;
        })
        .catch((err) => {
            let code = '?';
            if ('code' in err) {
                code = `${err.code}`;
                log("Check command aborted shutdown. Code: " + code);
            }
            _showTextbox(_('Shutdown aborted') + `\n${checkCmd} (Code: ${code})`);
            throw err;
        })
        .finally(() => {
            checkCancel = null;
        });
}


function shutdown() {
    Main.overview.hide();
    const session = new imports.misc.gnomeSession.SessionManager();
    const LoginManager = imports.misc.loginManager;
    const loginManager = LoginManager.getLoginManager();

    switch (internalScheduleInfo.mode) {
        case 'reboot':
            session.RebootRemote(0);
            break;
        case 'suspend':
            loginManager.suspend();
        default:
            session.ShutdownRemote(0);	// shutdown after 60s
            // const Util = imports.misc.util;
            // Util.spawnCommandLine('poweroff');	// shutdown immediately
            break;
    }
}

function render() {
    // submenu in status area menu with slider and toggle button
    let sliderItem = _createSliderItem();
    switcher = _createSwitcherItem();
    _updateSwitchLabel();
    
    submenu = new PopupMenu.PopupSubMenuMenuItem('', true);
    submenu.icon.icon_name = 'system-shutdown-symbolic';
    submenu.menu.addMenuItem(switcher);
    // make switcher toggle without popup menu closing
    switcher.disconnect(switcher._activateId);
    submenu.menu.addMenuItem(sliderItem);
    _updateSubmenuLabel();

    modeItems = Object.entries(MODE_LABELS)
        .map(([mode, label]) => {
            const modeItem = new PopupMenu.PopupMenuItem(label);
            modeItem.connect('activate', () => {
                _startMode(mode);
            });
            submenu.menu.addMenuItem(modeItem);
            return [mode, modeItem];
        });
    _updateShownModeItems();
    _updateSelectedModeItems();

    // add separator line and submenu in status area menu
    separator = new PopupMenu.PopupSeparatorMenuItem();
    let statusMenu = Main.panel.statusArea['aggregateMenu'];
    statusMenu.menu.addMenuItem(separator);
    statusMenu.menu.addMenuItem(submenu);
}

/* EXTENSION MAIN FUNCTIONS */
function init() {
    // initialize translations
    Convenience.initTranslations();

    // initialize settings
    settings = Convenience.getSettings();

    // check for shutdown may run in background and can be canceled by user
    checkCancel = null;
    // track external schutdown schedule
    // keeps track of priviledged process (for root mode)
    rootMode = new RootMode.RootMode(externalScheduleInfoTick);
    // starts internal shutdown schedule if ready
    timer = new Timer.Timer(serveInernalSchedule, internalScheduleInfoTick);
}

function enable() {

    externalScheduleInfo = new ScheduleInfo({external: true});
    internalScheduleInfo = new ScheduleInfo({
        external: false,
        deadline: settings.get_int('shutdown-timestamp-value'),
        mode: settings.get_string('shutdown-mode-value'),
    });
    displayedInfo = internalScheduleInfo;

    // render menu widget
    render();


    // handlers for changed values in settings
    settingsHandlerIds = [
        ['max-timer-value', _updateSwitchLabel],
        ['slider-value', _updateSlider],
        ['root-mode-value', _onRootModeChanged],
        ['show-settings-value', _onShowSettingsButtonChanged],
        ['show-shutdown-mode-value', _updateShownModeItems],
        ['shutdown-mode-value', _onModeChange],
        ['shutdown-timestamp-value', _onInternalShutdownTimestampChanged]
    ].map(([label, func]) => settings.connect( 'changed::' + label, func));


    internalScheduleInfoTick();
}


function disable() {
    timer.stopGLibTimer();
    settingsHandlerIds.forEach((handlerId) => {
        settings.disconnect(handlerId);
    });
    submenu.destroy(); // destroys switcher and sliderItem as children too
    separator.destroy();
    // requires root password again but root mode protection will NOT be canceled
    rootMode.stopScheduleInfoLoop();

}
