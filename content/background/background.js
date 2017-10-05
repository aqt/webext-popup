browser.runtime.onInstalled.addListener(details => {
	console.log("New install/update, creating default settings");

	let DEFAULT_SETTINGS = Object.freeze({
		"menu-item_tab": true,
		"menu-item_link": true,
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
