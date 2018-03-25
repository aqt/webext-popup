let elements;

function DOMLoaded() {
	let attr = "data-setting";
	elements = document.querySelectorAll(`[${attr}]`);

	button_save.setAttribute("disabled", "disabled");

	loadSettings();
	initializeListeners();
}

function initializeListeners() {
	button_save.addEventListener("click", () => {
		button_save.setAttribute("disabled", "disabled");
		// attachChangeListener();
		saveSettings();
	});

	attachChangeListener();
}

function attachChangeListener() {
	elements.forEach(element => {
		element.addEventListener("change", onChange);
	});
}

function detachChangeListener() {
	elements.forEach(element => {
		element.removeEventListener("change", onChange);
	});
}

function onChange() {
	button_save.removeAttribute("disabled");
	// detachChangeListener();
}


function loadSettings() {
	console.log("Loading settings");

	browser.storage.local.get().then(result => {
		for (key in result) {
			let value = result[key];
			let element = document.querySelector(`#${key}`);

			if (!element) {
				console.warn(`No settings element matching saved setting "${key}"`);
				continue;
			}

			switch(element.type.toLowerCase()) {
				default:
					console.log(`Using default for settings element of type "${element.type}"`)
					element.value = value;
					break;

				case "checkbox":
					element.checked = value;
					break;
			}
		}
	});
}

function saveSettings() {
	console.log("Saving settings");

	let batch = {};

	elements.forEach(element => {
		let val = undefined;

		switch(element.type.toLowerCase()) {
			default:
				val = element.value;
				break;

			case "checkbox":
				val = element.checked;
				break;
		}

		if (val !== undefined) {
			batch[element.id] = val;
		}
	});

	browser.storage.local.set(batch);
}

document.addEventListener("DOMContentLoaded", DOMLoaded);
