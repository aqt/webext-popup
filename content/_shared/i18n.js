function DOMLoaded() {
	let attr = "data-i18n-message";
	let elements = document.querySelectorAll(`[${attr}]`);

	elements.forEach(el => {
		el.textContent = browser.i18n.getMessage(el.getAttribute(attr));
	});

	attr = "data-i18n-title";
	elements = document.querySelectorAll(`[${attr}]`);

	elements.forEach(el => {
		el.title = browser.i18n.getMessage(el.getAttribute(attr));
	});
}

document.addEventListener("DOMContentLoaded", DOMLoaded);
