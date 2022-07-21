/**
    AUTHOR: Daniel Neumann
**/

const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Mainloop = imports.mainloop;
const Gettext = imports.gettext.domain('ShutdownTimer');
const _ = Gettext.gettext;
const Util = imports.misc.util;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

/* TIMER */
const Timer = GObject.registerClass({}, class Timer extends GObject.Object {

    _init(callbackAction) {
        this._timerValue = 0;
        this._timerId = null;
        this._startTime = 0;
        this._menuLabel = null;
        this._callbackAction = callbackAction;
        this._settings = ExtensionUtils.getSettings();
    }

    setMenuLabel(label) {
        this._menuLabel = label;
    }

    startTimer() {
        if (!this._timerId) {
            let sliderValue = this._settings.get_int('slider-value') / 100.0;
            this._timerValue = Math.floor(sliderValue * this._settings.get_int('max-timer-value'));
            
            if(this._settings.get_boolean('use-suspend-value') || !this._settings.get_boolean('root-mode-value')) {
                this._startTime = GLib.get_monotonic_time();
                this._timerId = Mainloop.timeout_add_seconds(1, () => this._timerCallback());
                const [hours, minutes] = this.convertTime(this._timerValue)
                this._menuLabel.text = hours + ' ' + _("h : ") + minutes + ' ' + _("min till shutdown");
            } else {
                let pkexec_path = GLib.find_program_in_path('pkexec');
                let shutdown_path = GLib.find_program_in_path('shutdown');
                Util.spawnCommandLine(pkexec_path + " " + shutdown_path + " -h " + this._timerValue);
            }
        }
    }

    stopTimer() {
        Mainloop.source_remove(this._timerId);
        this._timerId = null;
    }

    _timerCallback() {
        let currentTime = GLib.get_monotonic_time();
        let secondsElapsed = Math.floor((currentTime - this._startTime) / 1000000);
        
        let secondsLeft = (this._timerValue*60) - secondsElapsed;
        if (this._menuLabel && (secondsLeft % 60 == 0)) {
            const [hours, minutes] = this.convertTime(Math.floor(secondsLeft / 60))
            this._menuLabel.text = hours + ' ' +_("h : ") + minutes +' ' +_("min till shutdown");
        }
        if (secondsLeft > 0) {
            return true;
        }
        
        this._callbackAction();
        return false;
    }

    /**
    * Calculates hours and minutes from a time in minutes
    * @param {number} timeInMinutes
    * @returns {Array<number>} hours at index 0, minutes at index 1
    */
    convertTime(timeInMinutes) {
        const hours = Math.floor(timeInMinutes / 60)
        const minutes = timeInMinutes - hours * 60
        return [hours, minutes]
    }

});

