let _addonSettings;
let _dynamicMenuItems = [];

const Notification = Object.freeze({
	RESTORE_WINDOW: "RESTORE_WINDOW",
	CONVERT_EXISTING: "CONVERT_EXISTING",
});

const WindowType = Object.freeze({
	NORMAL: "normal",
	POPUP: "popup"
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

		let DEFAULT_SETTINGS = {
			"popup-position_x_default": "",
			"popup-position_y_default": "",
			"popup-position_width_default": "",
			"popup-position_height_default": "",
			"menu-item_tab": true,
			"menu-item_link": true,
			"menu-item_page": true,
			"menu-item_bookmark": true,
			"button-action": "MENU",
		};

		browser.storage.local.get().then(settings => {
			Object.assign(DEFAULT_SETTINGS, settings);
			browser.storage.local.set(DEFAULT_SETTINGS);
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
		if (info.parentMenuItemId === "page-restore") {
			browser.windows.get(info.menuItemId*1).then(wnd => restoreTab(tab, wnd));
			return;
		}

		switch (info.menuItemId) {
			default:
				console.warn("Unhandled menu item", info, tab);
				break;
			case "bookmark-popup":
				browser.bookmarks.get(info.bookmarkId).then(arr => {
					if (arr.length !== 1) {
						console.error(`Unhandled number of bookmarks of id:${info.bookmarkId} !?`);
						return;
					}

					open_popup({ "url": arr[0].url });
				});
				break;
			case "link-popup":
				open_popup({ "url": info.linkUrl });
				break;
			case "page-popup":
			case "tab-popup":
				open_popup({ "tab": tab });
				break;
			case "page-restore":
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

	let x = _addonSettings["popup-position_x_default"];
	let y = _addonSettings["popup-position_y_default"];
	let w = _addonSettings["popup-position_width_default"];
	let h = _addonSettings["popup-position_height_default"];

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
				browser.contextMenus.update("page-popup", { enabled: true }).then(() =>
					browser.contextMenus.update("page-popup", { visible: true })
				);
				browser.contextMenus.update("page-restore", { enabled: false }).then(() =>
					browser.contextMenus.update("page-restore", { visible: false })
				);

				break;
			case WindowType.POPUP:
				browser.contextMenus.update("page-popup", { enabled: false }).then(() =>
					browser.contextMenus.update("page-popup", { visible: false })
				);
				browser.contextMenus.update("page-restore", { enabled: true }).then(() =>
					browser.contextMenus.update("page-restore", { visible: true })
				);

				break;
		}
	});
}

function popuplateWindowList(info, tab) {
	if (~info.menuIds.indexOf("page-restore")) {
		_dynamicMenuItems.forEach(windowId => browser.contextMenus.remove(windowId));

		_dynamicMenuItems = [];

		browser.windows.getAll({ windowTypes: [ WindowType.NORMAL ] }).then(windows => {
			if (windows.length > 1) {
				windows.forEach(w => {
					_dynamicMenuItems.push(w.id + "");

					browser.contextMenus.create({
						id: w.id + "",
						title: w.title,
						parentId: "page-restore"
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

	if (settings["menu-item_tab"]) {
		browser.contextMenus.create({
			id: "tab-popup",
			title: browser.i18n.getMessage("menu-item_tab_popup"),
			contexts: [ "tab" ],
		});
	}

	if (settings["menu-item_link"]) {
		browser.contextMenus.create({
			id: "link-popup",
			title: browser.i18n.getMessage("menu-item_link_popup"),
			contexts: [ "link" ],
		});
	}

	if (settings["menu-item_bookmark"]) {
		browser.contextMenus.create({
			id: "bookmark-popup",
			title: browser.i18n.getMessage("menu-item_bookmark_popup"),
			contexts: [ "bookmark" ],
		});
	}

	if (settings["menu-item_page"]) {
		browser.windows.onFocusChanged.addListener(modifyPageContextMenu);
		browser.contextMenus.onShown.addListener(popuplateWindowList);

		browser.contextMenus.create({
			id: "page-popup",
			title: browser.i18n.getMessage("menu-item_page_popup"),
			contexts: [ "page" ],
		});

		browser.contextMenus.create({
			id: "page-restore",
			title: browser.i18n.getMessage("menu-item_page_restore"),
			contexts: [ "page" ],
		});

		// Firefox versions before 63 does not support `visible`, and even rejects the entire update
		browser.contextMenus.update("page-popup", { enabled: false }).then(() =>
			browser.contextMenus.update("page-popup", { visible: false })
		);
		browser.contextMenus.update("page-restore", { enabled: false }).then(() =>
			browser.contextMenus.update("page-restore", { visible: false })
		);
	} else {
		browser.windows.onFocusChanged.removeListener(modifyPageContextMenu);
		browser.contextMenus.onShown.removeListener(popuplateWindowList);
	}
}

main();
