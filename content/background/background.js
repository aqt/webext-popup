let _addonSettings;
let _dynamicMenuItems = [];

const Notification = Object.freeze({
	CONVERT_EXISTING: "CONVERT_EXISTING",
	RESTORE_WINDOW: "RESTORE_WINDOW",
});

const WindowType = Object.freeze({
	NORMAL: "normal",
	POPUP: "popup"
});

const ContextMenuType = Object.freeze({
	BOOKMARK_POPUP: "bookmark-popup",
	LINK_POPUP: "link-popup",
	PAGE_POPUP: "page-popup",
	PAGE_RESTORE: "Page-restore",
	TAB_POPUP: "tab-popup",
});

const SettingsKey = Object.freeze({
	BUTTON_ACTION: "button-action",
	MENU_ITEM_BOOKMARK: "menu-item_bookmark",
	MENU_ITEM_LINK: "menu-item_link",
	MENU_ITEM_PAGE: "menu-item_page",
	MENU_ITEM_TAB: "menu-item_tab",
	POPUP_POSITION: "popup-position",
	POPUP_POSITION_DEFAULTS_ENABLED: "popup-position_default_enabled",
	POPUP_POSITION_HEIGHT_DEFAULT: "popup-position_height_default",
	POPUP_POSITION_WIDTH_DEFAULT: "popup-position_width_default",
	POPUP_POSITION_X_DEFAULT: "popup-position_x_default",
	POPUP_POSITION_Y_DEFAULT: "popup-position_y_default",
	RULES: "rules",
	VERSION: "version",
	WORKAROUND_FORCE_POSITION: "workaround_force-position",
	WORKAROUND_OFFSET_SIZE: "workaround_popup-size",
	WORKAROUND_OFFSET_SIZE_X: "workaround_popup-size_x",
	WORKAROUND_OFFSET_SIZE_Y: "workaround_popup-size_y",
	WORKAROUND_OFFSET_SIZE_WIDTH: "workaround_popup-size_width",
	WORKAROUND_OFFSET_SIZE_HEIGHT: "workaround_popup-size_height",
});

function main() {
	// Apply current settings
	browser.storage.local.get().then(settings => actOnSettings(settings));

	addListeners();
}

function addListeners() {
	// Set default settings and (eventually) handle migration for new versions
	browser.runtime.onInstalled.addListener(details => {
		console.log("New install/update, creating default settings");

		browser.storage.local.get().then(settings => {
			let version;

			if (details.reason === "install") {
				version = "new";
			} else {
				if (settings.hasOwnProperty("version")) {
					version = settings[SettingsKey.VERSION];
				} else {
					version = "none";
				}
			}

			migrateSettings(settings, version);
		});
	});

	// Apply settings after changes
	browser.storage.onChanged.addListener((changes, area) => {
		let settings = {};

		for (key in changes) {
			settings[key] = changes[key].newValue;
		}

		actOnSettings(settings);
	});

	// Handle context menu items
	browser.contextMenus.onClicked.addListener((info, tab) => {
		if (info.parentMenuItemId === ContextMenuType.PAGE_RESTORE) {
			browser.windows.get(info.menuItemId*1).then(wnd => restoreTab(tab, wnd));
			return;
		}

		switch (info.menuItemId) {
			default:
				console.warn("Unhandled menu item", info, tab);
				break;
			case ContextMenuType.BOOKMARK_POPUP:
				browser.bookmarks.get(info.bookmarkId).then(arr => {
					if (arr.length !== 1) {
						console.error(`Unhandled number of bookmarks of id:${info.bookmarkId} !?`);
						return;
					}

					open_popup({ "url": arr[0].url });
				});
				break;
			case ContextMenuType.LINK_POPUP:
				open_popup({ "url": info.linkUrl });
				break;
			case ContextMenuType.PAGE_POPUP:
			case ContextMenuType.TAB_POPUP:
				open_popup({ "tab": tab });
				break;
			case ContextMenuType.PAGE_RESTORE:
				// If firefox doesn't make changes, the only way to get here is if there is no submenu of windows
				browser.windows.getAll({ windowTypes: [ WindowType.NORMAL ] }).then(windows => {
					if (windows.length > 0) {
						restoreTab(tab, windows[0])
					} else {
						// No `type` allowed in browser.windows.update, ugly workaround...
						browser.windows.create().then(wnd =>
							browser.tabs.move(tab.id, { windowId: wnd.id, index: -1 }).then(newTab =>
								browser.tabs.remove(wnd.tabs[0].id)
							)
						);
					}
				});

				break;
		}
	});

	// Receive messages from other scripts
	browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
		switch(message.type) {
			default:
				console.warn("Unhandled message!", message);
				break;

			case Notification.RESTORE_WINDOW:
				browser.windows.getCurrent().then(wnd => restoreTab(message.tab, wnd));
				break;

			case Notification.CONVERT_EXISTING:
				open_popup({ "tab": message.tab });
				break;
		}
	});


	// Listen for tab url changes
	try {
		browser.tabs.onUpdated.addListener(handleUpdatedTab, { "properties": [ "status" ] }); // "url" would be preferred but is not allowed
	} catch (e) {
		// Fallback due to second parameter added in version 61
		browser.tabs.onUpdated.addListener(handleUpdatedTab);
	}
}

function migrateSettings(settings, version) {
	switch (version) {
		default: return;

		case "new":
			// New install, only generate defaults
			settings[SettingsKey.POPUP_POSITION_X_DEFAULT] = "";
			settings[SettingsKey.POPUP_POSITION_Y_DEFAULT] = "";
			settings[SettingsKey.POPUP_POSITION_WIDTH_DEFAULT] = "";
			settings[SettingsKey.POPUP_POSITION_HEIGHT_DEFAULT] = "";
			settings[SettingsKey.MENU_ITEM_TAB] = true;
			settings[SettingsKey.MENU_ITEM_LINK] = true;
			settings[SettingsKey.MENU_ITEM_PAGE] = true;
			settings[SettingsKey.MENU_ITEM_BOOKMARK] = true;
			settings[SettingsKey.BUTTON_ACTION] = "MENU";
			settings[SettingsKey.POPUP_POSITION_DEFAULTS_ENABLED] = true;
			settings[SettingsKey.WORKAROUND_FORCE_POSITION] = false;
			settings[SettingsKey.WORKAROUND_OFFSET_SIZE] = false
			break;

		// INTENTIONAL FALLTHROUGH FOR ALL CASES BELOW
		case "none":
			// Update from old version prior to settings migration system, "version 1"
			if (settings.hasOwnProperty(SettingsKey.POPUP_POSITION)) {
				settings[SettingsKey.POPUP_POSITION].map(rule => {
					rule["appliestype"] = "DOMAIN"
					rule["search"] = rule["domain"].split(",").map(d => d+",*."+d).join(",");
					delete rule["domain"];
				});

				settings[SettingsKey.RULES] = settings[SettingsKey.POPUP_POSITION];
				delete settings[SettingsKey.POPUP_POSITION];

				browser.storage.local.remove("popup-position");
			}
		case "2":
			settings[SettingsKey.WORKAROUND_FORCE_POSITION] = true;
			settings[SettingsKey.POPUP_POSITION_DEFAULTS_ENABLED] = true;

			if (settings.hasOwnProperty(SettingsKey.RULES)) {
				for (let rule of settings[SettingsKey.RULES]) {
					rule["enabled"] = true;
				}
			}
		// case "3":
	}

	console.log("Settings migration, from version:"+ version);

	settings[SettingsKey.VERSION] = "3";

	browser.storage.local.set(settings);
}

function handleUpdatedTab(tabId, changeInfo, tab) {
	if (!changeInfo.hasOwnProperty("url")) {
		return;
	}

	browser.windows.get(tab.windowId).then(wnd => {
		if (wnd.type === WindowType.POPUP) {
			return;
		}

		let rule = getMatchingRule(changeInfo.url);

		if (rule && rule["autopopup"]) {
			open_popup({ "tab": tab }, rule);
		}
	});
}

function restoreTab(tab, wnd) {
	function cleanup(err, w, t) {
		browser.tabs.get(tab.id).then(newTab => {
			if (tab.windowId === newTab.windowId) {
				console.error("Error restoring tab: ", err);
			} else {
				// Cleanup necessary until unknown firefox version before 62
				browser.windows.remove(tab.windowId)
			}
		});
	}

	if (tab.windowId === wnd.id) {
		browser.windows.create({ tabId: tab.id }).then(() => cleanup(undefined, wnd, tab)).catch(err => cleanup(err, wnd, tab));
	} else {
		browser.tabs.move(tab.id, { windowId: wnd.id, index: -1 }).catch(err => cleanup(err, wnd, tab));
	}
}

function open_popup(settings, rule) {
	let data = { "type": WindowType.POPUP };

	let url = "";

	if (settings.hasOwnProperty("url")) {
		data.url = settings.url;
		url = settings.url;
	} else if (settings.hasOwnProperty("tab")) {
		data.tabId = settings.tab.id;
		url = settings.tab.url;
	} else {
		console.warn("Unknown popup type", settings);
		return;
	}

	if (typeof rule === "undefined") {
		rule = getMatchingRule(url);
	}

	let x, y, w, h;
	let ox=0, oy=0, ow=0, oh=0;

	if (rule) {
		x = rule.x;
		y = rule.y;
		w = rule.width;
		h = rule.height;
	} else {
		if (_addonSettings[SettingsKey.POPUP_POSITION_DEFAULTS_ENABLED]) {
			x = _addonSettings[SettingsKey.POPUP_POSITION_X_DEFAULT];
			y = _addonSettings[SettingsKey.POPUP_POSITION_Y_DEFAULT];
			w = _addonSettings[SettingsKey.POPUP_POSITION_WIDTH_DEFAULT];
			h = _addonSettings[SettingsKey.POPUP_POSITION_HEIGHT_DEFAULT];
		}
	}

	if (_addonSettings[SettingsKey.WORKAROUND_OFFSET_SIZE]) {
		ox = (_addonSettings[SettingsKey.WORKAROUND_OFFSET_SIZE_X] || 0) * 1;
		oy = (_addonSettings[SettingsKey.WORKAROUND_OFFSET_SIZE_Y] || 0) * 1;
		ow = (_addonSettings[SettingsKey.WORKAROUND_OFFSET_SIZE_WIDTH] || 0) * 1;
		oh = (_addonSettings[SettingsKey.WORKAROUND_OFFSET_SIZE_HEIGHT] || 0) * 1;
	}

	if (typeof x !== "undefined" && x !== "") {
		data.left = x * 1 + ox;
	}

	if (typeof y !== "undefined" && y !== "") {
		data.top = y * 1 + oy;
	}

	if (typeof w !== "undefined" && w !== "") {
		data.width = w * 1 + ow;
	}

	if (typeof h !== "undefined" && h !== "") {
		data.height = h * 1 + oh;
	}

	try {
		browser.windows.create(data).then(wnd => {
			// Try to update properties if they were ignored in create

			if (!_addonSettings[SettingsKey.WORKAROUND_FORCE_POSITION]) {
				return;
			}

			let performUpdate = false;
			let retryData = {};

			if (data.left !== wnd.left || data.top !== wnd.top) {
				performUpdate = true;
				retryData["left"] = data.left;
				retryData["top"] = data.top;
			}

			if (data.width !== wnd.width || data.height !== wnd.height) {
				performUpdate = true;
				retryData["width"] = data.width;
				retryData["height"] = data.height;
			}

			if (performUpdate) {
				browser.windows.update(wnd.id, retryData);
			}
		});
	} catch(e) {
		console.error("Cannot open popup", e);
	}
}

function modifyPageContextMenu(windowId) {
	if (windowId == browser.windows.WINDOW_ID_NONE) {
		return;
	}

	browser.windows.get(windowId).then(wnd => {
		switch (wnd.type.toLowerCase()) {
			case WindowType.NORMAL:
				// Firefox versions before 63 does not support `visible`, and even rejects the entire update
				browser.contextMenus.update(ContextMenuType.PAGE_POPUP, { enabled: true }).then(() =>
					browser.contextMenus.update(ContextMenuType.PAGE_POPUP, { visible: true })
				);
				browser.contextMenus.update(ContextMenuType.PAGE_RESTORE, { enabled: false }).then(() =>
					browser.contextMenus.update(ContextMenuType.PAGE_RESTORE, { visible: false })
				);

				break;
			case WindowType.POPUP:
				browser.contextMenus.update(ContextMenuType.PAGE_POPUP, { enabled: false }).then(() =>
					browser.contextMenus.update(ContextMenuType.PAGE_POPUP, { visible: false })
				);
				browser.contextMenus.update(ContextMenuType.PAGE_RESTORE, { enabled: true }).then(() =>
					browser.contextMenus.update(ContextMenuType.PAGE_RESTORE, { visible: true })
				);

				break;
		}
	});
}

function popuplateWindowList(info, tab) {
	if (~info.menuIds.indexOf(ContextMenuType.PAGE_RESTORE)) {
		_dynamicMenuItems.forEach(windowId => browser.contextMenus.remove(windowId));

		_dynamicMenuItems = [];

		browser.windows.getAll({ windowTypes: [ WindowType.NORMAL ] }).then(windows => {
			if (windows.length > 1) {
				windows.forEach(w => {
					_dynamicMenuItems.push(w.id + "");

					browser.contextMenus.create({
						id: w.id + "",
						title: w.title,
						parentId: ContextMenuType.PAGE_RESTORE
					});
				});

				browser.contextMenus.refresh();
			}
		});
	}
}

function escapeForRegex(str) {
	let wildcardReplacement = "\u0006\u0015\u0000";
	let wildcardRegex = new RegExp(wildcardReplacement, "g")

	str = str.replace(/\*/g, wildcardReplacement);
	str = str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions
	str = "^" + str.replace(wildcardRegex, ".*") + "$";
	str = str.replace(/,/g, "|");

	return str;
}

function getMatchingRule(url) {
	let a = document.createElement("a");
	a.setAttribute("href", url);

	if (typeof _addonSettings[SettingsKey.RULES] === "undefined") {
		return undefined;
	}

	for (let rule of _addonSettings[SettingsKey.RULES]) {
		if (!rule["enabled"]) {
			continue;
		}

		let regex;

		if (rule["search"].charAt(0) === "/") {
			let tmpSearch = rule["search"].substr(1);
			let idx = tmpSearch.lastIndexOf("/");

			if (!~idx) {
				continue;
			}

			let flags = tmpSearch.slice(idx + 1);

			regex = new RegExp(tmpSearch.slice(0, idx), flags);
		} else {
			regex = escapeForRegex(rule["search"]);
		}

		if (rule["appliestype"] === "DOMAIN") {
			if (~a.hostname.search(regex)) {
				return rule;
			}
		} else {
			if (~url.search(regex)) {
				return rule;
			}
		}
	}

	return undefined;
}

function actOnSettings(settings) {
	console.log("Acting on new settings");

	_addonSettings = settings;

	browser.contextMenus.removeAll();

	if (settings[SettingsKey.MENU_ITEM_TAB]) {
		browser.contextMenus.create({
			id: ContextMenuType.TAB_POPUP,
			title: browser.i18n.getMessage("menu-item_tab_popup"),
			contexts: [ "tab" ],
		});
	}

	if (settings[SettingsKey.MENU_ITEM_LINK]) {
		browser.contextMenus.create({
			id: ContextMenuType.LINK_POPUP,
			title: browser.i18n.getMessage("menu-item_link_popup"),
			contexts: [ "link" ],
		});
	}

	try {
		if (settings[SettingsKey.MENU_ITEM_BOOKMARK]) {
			browser.contextMenus.create({
				id: ContextMenuType.BOOKMARK_POPUP,
				title: browser.i18n.getMessage("menu-item_bookmark_popup"),
				contexts: [ "bookmark" ],
			});
		}
	} catch (e) {
		console.warn("Feature unavailable: Bookmark context menus");
	}

	if (settings[SettingsKey.MENU_ITEM_PAGE]) {
		browser.windows.onFocusChanged.addListener(modifyPageContextMenu);

		if (browser.contextMenus.hasOwnProperty("onShown")) {
			browser.contextMenus.onShown.addListener(popuplateWindowList);
		}

		browser.contextMenus.create({
			id: ContextMenuType.PAGE_POPUP,
			title: browser.i18n.getMessage("menu-item_page_popup"),
			contexts: [ "page" ],
		});

		browser.contextMenus.create({
			id: ContextMenuType.PAGE_RESTORE,
			title: browser.i18n.getMessage("menu-item_page_restore"),
			contexts: [ "page" ],
		});

		// Firefox versions before 63 does not support `visible`, and even rejects the entire update
		browser.contextMenus.update(ContextMenuType.PAGE_POPUP, { enabled: false }).then(() =>
			browser.contextMenus.update(ContextMenuType.PAGE_POPUP, { visible: false })
		);
		browser.contextMenus.update(ContextMenuType.PAGE_RESTORE, { enabled: false }).then(() =>
			browser.contextMenus.update(ContextMenuType.PAGE_RESTORE, { visible: false })
		);
	} else {
		browser.windows.onFocusChanged.removeListener(modifyPageContextMenu);

		if (browser.contextMenus.hasOwnProperty("onShown")) {
			browser.contextMenus.onShown.removeListener(popuplateWindowList);
		}
	}
}

main();
