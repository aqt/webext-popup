function DOMLoaded() {
	let attr = "data-i18n-message";
	let elements = document.querySelectorAll(`[${attr}]`);

	let usePlaceholder = typeof browser === "undefined";

	elements.forEach(el => {
		let text = el.getAttribute(attr);
		el.textContent = usePlaceholder ? "$"+text : browser.i18n.getMessage(text);
	});

	attr = "data-i18n-title";
	elements = document.querySelectorAll(`[${attr}]`);

	elements.forEach(el => {
		let text = el.getAttribute(attr);
		el.title = usePlaceholder ? "$"+text : browser.i18n.getMessage(text);
	});

	attr = "data-i18n-placeholder";
	elements = document.querySelectorAll(`[${attr}]`);

	elements.forEach(el => {
		let text = el.getAttribute(attr);
		el.placeholder = usePlaceholder ? "$"+text : browser.i18n.getMessage(text);
	});
}

document.addEventListener("DOMContentLoaded", DOMLoaded);
