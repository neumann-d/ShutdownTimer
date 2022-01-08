# Shutdown Timer

> An extended version of this GNOME shell extension is maintained by Deminder ([https://github.com/Deminder/ShutdownTimer](https://github.com/Deminder/ShutdownTimer)). You can install it from [https://extensions.gnome.org/extension/4372/shutdowntimer/](https://extensions.gnome.org/extension/4372/shutdowntimer/).

Shutdown/suspend your device after a specific time. This extension adds a submenu to the status area. 

![Screenshot](screenshot.png)


There is a settings menu where you can change the following:
* Maximum timer value
* Default slider position
* Show settings button in widget
* Root mode: Uses "pkexec shutdown" command instead of default GNOME shutdown dialog. If monitor turns off while shutdown timer is running, then default timer in rootless mode gets interrupted.
  With root mode activated this can not happen, but you have to enter the root password.
* Suspend mode: Suspend device instead of shutdown


## Official Installation

Visit [https://extensions.gnome.org/extension/792/shutdowntimer/](https://extensions.gnome.org/extension/792/shutdowntimer/) and follow the browser extension install instructions.


## Manual Installation

Build, extract and copy `ShutdownTimer@neumann` directory to `~/.local/share/gnome-shell/extensions`
```
$ gnome-extensions pack --podir=po --extra-source=timer.js --force src
$ unzip -o -d ShutdownTimer@neumann ShutdownTimer@neumann.shell-extension.zip
$ cp -r ShutdownTimer@neumann ~/.local/share/gnome-shell/extensions
$ rm -rf ShutdownTimer@neumann/
$ rm ShutdownTimer@neumann.shell-extension.zip
```

Install `gnome-shell-extensions`
```
$ sudo apt install gnome-shell-extensions
```

Open GNOME tweak tool and enable `Shutdowntimer` in extensions menu.
```
$ gnome-tweaks
```

If `gnome-shell-extensions` were already installed and you want to refresh GNOME shell after manual installation, do
```
$ killall -SIGQUIT gnome-shell
```

### For GNOME 40+
Install `org.gnome.Extensions` via flatpak
```
$ flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
$ flatpak install flathub org.gnome.Extensions
```

Open GNOME shell extension tool
```
$ flatpak run org.gnome.Extensions
```

## Development

### Restart GNOME-Shell (Xorg only)
Press `ALT+F2`, type `r` and press `Enter`

### Restart GNOME-Shell (Command line)
```
$ killall -SIGQUIT gnome-shell
```

### See Errors and Logs
* Press `ALT+F2`, type `lg` and press `Enter`
* Run `journalctl -f` in terminal

### Translations
You can use *POEdit* or *Gtranslator* to create or update a translation file (`.po`) based on the `src/po/ShutdownTimer.pot` template.

### Build
Use `gnome-extensions` tool
```
$ gnome-extensions pack --podir=po --force ShutdownTimer@neumann
```
