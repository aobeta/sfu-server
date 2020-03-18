function getElement(query) {
  const element = document.querySelector(query);
  if (!element)
    throw new Error(`Could not find an element with the selector: ${query}`);

  return element;
}

module.exports = getElement;
