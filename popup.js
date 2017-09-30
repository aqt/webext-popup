chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
	let url = tabs[0].url

	if (url.substr(0, 4) === "http") {
		chrome.windows.create({ url, type: "popup" });
	}

	window.close();
});
