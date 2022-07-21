/**
    AUTHOR: Daniel Neumann
    GJS SOURCES: https://github.com/GNOME/gnome-shell/
    COMPILING SCHEMAS: glib-compile-schemas schemas/
    EDIT LOCALE: e.g. use Poedit and open *.po files
**/

/* IMPORTS */
// icons and labels
const St = imports.gi.St;

// screen and main functionality
const Main = imports.ui.main;
const Clutter = imports.gi.Clutter;


// menu items
const PopupMenu = imports.ui.popupMenu;
const Slider = imports.ui.slider;
const Switcher = imports.ui.switcherPopup;

// translations
const Gettext = imports.gettext.domain('ShutdownTimer');
const _ = Gettext.gettext;

// import own scripts
const ExtensionUtils = imports.misc.extensionUtils;
const Extension = ExtensionUtils.getCurrentExtension();
const Timer = Extension.imports.timer;

/* GLOBAL VARIABLES */
let textbox, submenu, slider, switcher, separator, settings, timer;
let settingsSignals = [];

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
        duration: 4000,
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
function _onSliderChanged() {
    settings.set_int('slider-value', (slider.value * 100));
    const [hours, minutes] = timer.convertTime(_getTimerStartValue())
    switcher.label.text = hours + ' ' +_("h : ") + minutes + ' min';
    
    if (settings.get_boolean('root-mode-value')) {
        switcher.label.text = hours + ' ' +_("h : ") + minutes + ' min (root)'; 
    }
}

function _onSettingsChanged() {
    let sliderValue =  settings.get_int('slider-value') / 100.0;
    slider.value = sliderValue;
    const [hours, minutes] = timer.convertTime(_getTimerStartValue())
    switcher.label.text = hours + ' ' +_("h : ") + minutes + ' ' +_("min");
    
    if (settings.get_boolean('root-mode-value')) {
        switcher.label.text = hours + ' ' +_("h : ") + minutes + ' ' +_("min (root)");
    }
}

function _onShowSettingsButtonChanged() {
    submenu.destroy();
    separator.destroy();
    render();
}

// toggle button starts/stops shutdown timer
function _onToggle() {
    if(switcher.state) {
        timer.startTimer();
        const [hours, minutes] = timer.convertTime(_getTimerStartValue())
        _showTextbox(   _("System will shutdown in")+ ' ' 
                        + hours + ' ' +_("h : ") + minutes + ' '+_("minutes"));
    } else {
        timer.stopTimer();
        _showTextbox(_("Shutdown Timer stopped"));
        submenu.label.text = _("Shutdown Timer");
    }
}

// menu items switcher and slider
function _createSwitcherItem() {
    let switchMenuItem = new PopupMenu.PopupSwitchMenuItem('', false);
    const [hours, minutes] = timer.convertTime(_getTimerStartValue())
    switchMenuItem.label.text = hours + ' ' +_("h : ") + minutes + ' ' +_("min");
    if(settings.get_boolean('root-mode-value')) {
        switchMenuItem.label.text = hours + ' ' +_("h : ") + minutes + ' ' +_("min (root)");
    }
    
    switchMenuItem.connect('toggled', _onToggle);

    if(settings.get_boolean('show-settings-value')) {
        let switcherSettingsButton = new St.Button({reactive: true,
                                                    can_focus: true,
                                                    track_hover: true,
                                                    accessible_name: _("Settings"),
                                                    style_class: 'system-menu-action settings-button' });
        switcherSettingsButton.child = new St.Icon({icon_name: 'emblem-system-symbolic', 
                                                    style_class: 'popup-menu-icon' });
        switcherSettingsButton.connect('clicked', function () {
                ExtensionUtils.openPrefs();
        });
        switchMenuItem.add_actor(switcherSettingsButton);
    }
    
    return switchMenuItem;
}

function _createSliderItem() {
    let sliderValue =  settings.get_int('slider-value') / 100.0;
    let sliderItem = new PopupMenu.PopupMenuItem('');
    let sliderIcon = new St.Icon({  icon_name: 'preferences-system-time-symbolic', 
                                    style_class: 'popup-menu-icon' });
    sliderItem.actor.add(sliderIcon);
    slider = new Slider.Slider(sliderValue);
    slider.connect('notify::value', _onSliderChanged);
    sliderItem.add_actor(slider);
    return sliderItem;
}

// timer action (shutdown/suspend)
function timerAction() {
    if(settings.get_boolean('use-suspend-value')) {
        suspend();
    } else {
        powerOff();
    }
}

// shutdown the device
function powerOff() {
    Main.overview.hide();

    const GnomeSession = imports.misc.gnomeSession;
    let session = new GnomeSession.SessionManager();
    session.ShutdownRemote(0);	// shutdown after 60s

    // const Util = imports.misc.util;
    //Util.spawnCommandLine('poweroff');	// shutdown immediately
}

// suspend the device
function suspend() {
    Main.overview.hide();

    const LoginManager = imports.misc.loginManager;
    let loginManager = LoginManager.getLoginManager();
    loginManager.suspend();
}

function render() {
    // submenu in status area menu with slider and toggle button
    let sliderItem = _createSliderItem();
    switcher = _createSwitcherItem();
    
    submenu = new PopupMenu.PopupSubMenuMenuItem(_("Shutdown Timer"), true);
    submenu.icon.icon_name = 'system-shutdown-symbolic';
    submenu.menu.addMenuItem(switcher);
    submenu.menu.addMenuItem(sliderItem);
    timer.setMenuLabel(submenu.label);

    // add separator line and submenu in status area menu
    separator = new PopupMenu.PopupSeparatorMenuItem();
    let statusMenu = Main.panel.statusArea['aggregateMenu'];
    statusMenu.menu.addMenuItem(separator);
    statusMenu.menu.addMenuItem(submenu);
}

/* EXTENSION MAIN FUNCTIONS */
function init() {
    // initialize translations
    ExtensionUtils.initTranslations();
}

function enable() {
    // initialize timer
    timer = new Timer.Timer(timerAction);

    // initialize settings
    settings = ExtensionUtils.getSettings();

    // render menu widget
    render();

    // handlers for changed values in settings
    settingsSignals.push(settings.connect('changed::max-timer-value', _onSettingsChanged));
    settingsSignals.push(settings.connect('changed::slider-value', _onSettingsChanged));
    settingsSignals.push(settings.connect('changed::root-mode-value', _onSettingsChanged));
    settingsSignals.push(settings.connect('changed::show-settings-value', _onShowSettingsButtonChanged));
}

function disable() {
    timer.stopTimer(); // removes timer from Mainloop
    submenu.destroy(); // destroys switcher and sliderItem as children too
    separator.destroy();

    // disconnect settings signals
    settingsSignals.forEach((signal) => settings.disconnect(signal));
    settingsSignals = [];

    timer = null;
    settings = null;
}
