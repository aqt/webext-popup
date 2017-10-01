chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
	let url = tabs[0].url;

	try {
		chrome.windows.create({ url, type: "popup" });
		window.close();
	} catch(e) {
		output.innerHTML = `<strong>Cannot open a popup for this URL</strong> <hr> <code>${e}</code>`;
	}
});
