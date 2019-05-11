let BUTTON_ACTION = Object.freeze({
	"POPUP": "POPUP",
	"MENU": "MENU",
});

let action_setting = "button-action";

let submenu_container = document.querySelector("#submenu-restore_window-container");
let submenu_menu = document.querySelector("#submenu-restore_window-menu");

let settings_button = document.querySelector("#open-settings");
settings_button.addEventListener("click", e => browser.runtime.openOptionsPage());

function convertThisTab() {
	browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
		let tab = tabs[0];

		browser.runtime.sendMessage({ "type": "CONVERT_EXISTING", tab });
		window.close();
	});
}

function buildMenu() {
	function restoreWindow(tab) {
		browser.runtime.sendMessage({ "type": "RESTORE_WINDOW", tab });
		window.close();
	}

	function appendWindowItem(wnd, tab) {
		// Firefox 56.0.2 doesn't seem to be able to retrieve tab.title, but can retrieve window.title
		let wndTitle = wnd ? wnd.title : undefined;
		let title = tab.title || wndTitle || browser.i18n.getMessage("button_menu-item_restore-unknown_title");

		let li = document.createElement("li");
		li.classList.add("menu-item");

		let a = document.createElement("a");
		a.textContent = title;

		a.addEventListener("click", e => restoreWindow(tab));

		li.appendChild(a);
		submenu_menu.appendChild(li);
	}

	browser.tabs.query({ windowType: "popup" }).then(tabs => {
		if (!tabs.length) {
			return;
		}

		restore_window.classList.remove("disabled");

		tabs.forEach(tab => {
			browser.windows.get(tab.windowId).then(
				wnd => appendWindowItem(wnd, tab),
				err => appendWindowItem(undefined, tab)
			);
		});
	});
}

browser.storage.local.get([ action_setting ]).then(settings => {
	let action = settings[action_setting];

	switch (action) {
		default:
		case BUTTON_ACTION.MENU:
			buildMenu();
			break;

		case BUTTON_ACTION.POPUP:
			convertThisTab();
			break;
	}
});

open_popup.addEventListener("click", convertThisTab);
restore_window.addEventListener("click", e => submenu_container.classList.toggle("hidden"));
