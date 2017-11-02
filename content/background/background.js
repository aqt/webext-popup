browser.runtime.onInstalled.addListener(details => {
	console.log("New install/update, creating default settings");

	let DEFAULT_SETTINGS = Object.freeze({
		"menu-item_tab": true,
		"menu-item_link": true,
		"button-action": "MENU",
	});

	browser.storage.local.get().then(settings => {
		Object.assign(settings, DEFAULT_SETTINGS);
		browser.storage.local.set(settings);
	});
});

browser.storage.onChanged.addListener((changes, area) => {
	let settings = {};

	for (key in changes) {
		settings[key] = changes[key].newValue;
	}

	actOnSettings(settings);
});

browser.contextMenus.onClicked.addListener((info, tab) => {
	switch(info.menuItemId) {
		default:
			console.warn("Unhandled menu item", info, tab);
			break;
		case "link-popup":
			open_popup({ "url": info.linkUrl });
			break;
		case "tab-popup":
			open_popup({ "tab": tab });
			break;
	}
});

let Notification = Object.freeze({
	RESTORE_WINDOW: "RESTORE_WINDOW",
	CONVERT_EXISTING: "CONVERT_EXISTING",
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
	switch(message.type) {
		default:
			console.warn("Unhandled message!", message);
			break;

		case Notification.RESTORE_WINDOW:
			restoreTab(message.tab);
			break;

		case Notification.CONVERT_EXISTING:
			open_popup({ "tab": message.tab });
			break;
	}
});

function restoreTab(tab) {
	browser.windows.getCurrent().then(wnd => {
		browser.tabs.move(tab.id, { windowId: wnd.id, index: -1 }).then(
			() => browser.windows.remove(tab.windowId),

			e => {
				console.log("Error moving tab", e);
				console.log("Running workaround to check if error was sent erroneously");

				browser.tabs.query({ windowId: tab.windowId }).then(tabs => {
					// There should always be only one tab, but to cover all cases...
					if (tabs.length === 0) {
						browser.windows.remove(tab.windowId);
					} else {
						tabs.some(newTab => {
							if (tab.id !== newTab.id) {
								browser.windows.remove(tab.windowId);
								return true;
							}
						});
					}
				});
			}
		);
	});
}

function open_popup(settings) {
	let data = { "type": "popup" };

	if (settings.hasOwnProperty("url")) {
		data.url = settings.url;
	} else if (settings.hasOwnProperty("tab")) {
		data.tabId = settings.tab.id;
	} else {
		console.warn("Unknown popup type", settings);
		return;
	}

	try {
		browser.windows.create(data);
	} catch(e) {
		console.error("Cannot open popup", e);
	}
}

function actOnSettings(settings) {
	console.log("Acting on new settings");

	browser.contextMenus.removeAll();

	if (settings["menu-item_tab"]) {
		browser.contextMenus.create({
			id: "tab-popup",
			title: browser.i18n.getMessage("menu-item_tab_popup"),
			contexts: [ "tab" ],
		});
	} else {
		browser.contextMenus.remove("tab-popup");
	}

	if (settings["menu-item_link"]) {
		browser.contextMenus.create({
			id: "link-popup",
			title: browser.i18n.getMessage("menu-item_link_popup"),
			contexts: [ "link" ],
		});
	} else {
		browser.contextMenus.remove("link-popup");
	}
}

browser.storage.local.get().then(settings => actOnSettings(settings));