let singleSettingElements;
let multiSettingElements;

function DOMLoaded() {
	singleSettingElements = [...document.querySelectorAll(`[data-setting]`)];
	multiSettingElements = [...document.querySelectorAll(`[data-setting-list]`)];

	button_save.setAttribute("disabled", "disabled");

	loadSettings();
	initializeListeners();
}

function initializeListeners() {
	button_save.addEventListener("click", () => {
		button_save.setAttribute("disabled", "disabled");
		saveSettings();
	});

	// Button functionality to add new row to list settings
	let addListItemButtons = document.querySelectorAll(`[data-setting-list-item-add]`);
	for (let button of addListItemButtons) {
		for (let parent = button; parent; parent = parent.parentElement) {
			if (parent.tagName.toLowerCase() === "table") {
				button.addEventListener("click", e => addNewRowToList(parent));
				continue;
			}
		}
	}

	attachChangeListener(singleSettingElements);
}

function attachChangeListener(elements) {
	elements.forEach(element => {
		element.addEventListener("change", onChange);
	});
}

function detachChangeListener(elements) {
	elements.forEach(element => {
		element.removeEventListener("change", onChange);
	});
}

function onChange() {
	button_save.removeAttribute("disabled");
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

			if (value instanceof Array) {
				// List setting

				for (let rowObject of value) {
					let newRow = addNewRowToList(element);

					for (let col of Object.keys(rowObject)) {
						let input = newRow.querySelector(`[data-setting-id="${ col }"]`);

						setValueForInput(input, rowObject[col]);
					}
				}
			} else {
				// Single setting
				setValueForInput(element, value);
			}
		}
	});
}

function getValueForInput(element) {
	switch(element.type.toLowerCase()) {
		default:
			return element.value;

		case "checkbox":
			return element.checked;
	}

	return undefined;
}

function setValueForInput(element, value) {
	switch(element.type.toLowerCase()) {
		default:
			console.log(`Using default for settings element of type "${element.type}"`, element);
			element.value = value;
			break;

		case "number":
		case "select-one":
		case "text":
			element.value = value;
			break;

		case "checkbox":
			element.checked = value;
			break;
	}
}

function saveSettings() {
	console.log("Saving settings");

	let batch = {};

	singleSettingElements.forEach(element => {
		let val = getValueForInput(element);

		if (val !== undefined) {
			batch[element.id] = val;
		}
	});

	multiSettingElements.forEach(element => {
		let val = [];

		let listItems = element.querySelectorAll("[data-setting-list-item]");

		for (let row of listItems) {
			let item = {};

			let subkeys = row.querySelectorAll("[data-setting-id]");

			for (let sk of subkeys) {
				let sk_id = sk.getAttribute("data-setting-id");
				let sk_value = getValueForInput(sk);

				if (sk_value !== undefined) {
					item[sk_id] = sk_value;
				}
			}

			val.push(item);
		}

		batch[element.id] = val;
	});

	browser.storage.local.set(batch);
}

function addNewRowToList(table) {
	let template = table.querySelector("[data-setting-list-item-template]");

	if (!template) {
		console.warn("No template found for table:", table);
		return;
	}

	let templateClone = template.cloneNode(true);
	templateClone.classList.remove("hidden");
	templateClone.removeAttribute("data-setting-list-item-template");
	templateClone.setAttribute("data-setting-list-item", "");

	let deleteButton = templateClone.querySelector("[data-setting-list-item-delete]");
	deleteButton.addEventListener("click", e => { e.target.parentElement.parentElement.remove(); onChange(); });

	attachChangeListener(templateClone.querySelectorAll("[data-setting-id]"));

	let row = table.insertRow(table.rows.length - 1); // Subtract due to add button
	row.replaceWith(templateClone);

	return templateClone;
}

document.addEventListener("DOMContentLoaded", DOMLoaded);
