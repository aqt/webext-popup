browser.tabs.query({ active: true, currentWindow: true }, tabs => {
	let tabId = tabs[0].id;

	try {
		browser.windows.create({ tabId, type: "popup" });
		window.close();
	} catch(e) {
		output.innerHTML = `<strong>${ browser.i18n.getMessage("button_error_open") }</strong> <hr> <code>${ e }</code>`;
	}
});
