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
	POPUP_POSITION_HEIGHT_DEFAULT: "popup-position_height_default",
	POPUP_POSITION_WIDTH_DEFAULT: "popup-position_width_default",
	POPUP_POSITION_X_DEFAULT: "popup-position_x_default",
	POPUP_POSITION_Y_DEFAULT: "popup-position_y_default",
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
					version = settings["version"];
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
	console.log("Settings migration, from version:"+ version);

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
			break;

		// INTENTIONAL FALLTHROUGH
		// case "none":
			// Update from old version prior to settings migration system, "version 1"
		// case "2":
		// case "3":
	}

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

		if (_addonSettings.hasOwnProperty("popup-position")) {
			let target = document.createElement("a");
			target.setAttribute("href", changeInfo.url);

			let shouldOpen = false;

			outer_loop:
			for (let row of _addonSettings["popup-position"]) {
				if (!row.hasOwnProperty("autopopup") || !row.autopopup) {
					continue;
				}

				let domains;

				// User may want to add multiple domains
				if (~row.domain.indexOf(",")) {
					domains = row.domain.split(",");
				} else {
					domains = [ row.domain ];
				}

				for (let d of domains) {
					// Match subdomains as well
					if (target.hostname.endsWith(d.trim())) {
						shouldOpen = true;
						break outer_loop;
					}
				}
			}

			if (shouldOpen) {
				open_popup({ "tab": tab });
			}
		}
	});
}

function restoreTab(tab, wnd) {
	browser.tabs.move(tab.id, { windowId: wnd.id, index: -1 }).catch(err => {
		browser.tabs.get(tab.id).then(newTab => {
			if (tab.windowId === newTab.windowId) {
				console.error("Error restoring tab: ", err);
			} else {
				// Cleanup necessary until unknown firefox version before 62
				browser.windows.remove(tab.windowId)
			}
		});
	});
}

function open_popup(settings) {
	let data = { "type": WindowType.POPUP };

	let x = _addonSettings[SettingsKey.POPUP_POSITION_X_DEFAULT];
	let y = _addonSettings[SettingsKey.POPUP_POSITION_Y_DEFAULT];
	let w = _addonSettings[SettingsKey.POPUP_POSITION_WIDTH_DEFAULT];
	let h = _addonSettings[SettingsKey.POPUP_POSITION_HEIGHT_DEFAULT];

	if (x !== "") {
		data.left = x * 1;
	}

	if (y !== "") {
		data.top = y * 1;
	}

	if (w) {
		data.width = w * 1;
	}

	if (h) {
		data.height = h * 1;
	}

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

	// Set data arguments from settings
	if (_addonSettings.hasOwnProperty("popup-position")) {
		let target = document.createElement("a");
		target.setAttribute("href", url);

		outer_loop:
		for (let row of _addonSettings["popup-position"]) {
			let domains;

			// User may want to add multiple domains
			if (~row.domain.indexOf(",")) {
				domains = row.domain.split(",");
			} else {
				domains = [ row.domain ];
			}

			for (let d of domains) {
				// Match subdomains as well
				if (target.hostname.endsWith(d.trim())) {
					if (typeof row.x !== "undefined" && row.x !== "") {
						data.left = row.x * 1;
					}

					if (typeof row.y !== "undefined" && row.y !== "") {
						data.top = row.y * 1;
					}

					if (row.width !== "") {
						data.width = row.width * 1;
					}

					if (row.height !== "") {
						data.height = row.height * 1;
					}

					break outer_loop;
				}
			}
		}
	}

	try {
		browser.windows.create(data).then(wnd => {
			if (data.left === wnd.left && data.top === wnd.top) {
				return;
			}

			// left/top not acted on in create data...
			browser.windows.update(wnd.id, { "left": data.left, "top": data.top });
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

	if (settings[SettingsKey.MENU_ITEM_BOOKMARK]) {
		browser.contextMenus.create({
			id: ContextMenuType.BOOKMARK_POPUP,
			title: browser.i18n.getMessage("menu-item_bookmark_popup"),
			contexts: [ "bookmark" ],
		});
	}

	if (settings[SettingsKey.MENU_ITEM_PAGE]) {
		browser.windows.onFocusChanged.addListener(modifyPageContextMenu);
		browser.contextMenus.onShown.addListener(popuplateWindowList);

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
		browser.contextMenus.onShown.removeListener(popuplateWindowList);
	}
}

main();
