getRecipe.addEventListener("click", async () => {

  const url = linkInput.value.trim();
  const recipeResultDiv = document.getElementById("recipeResult");

  if (!url) {
    recipeResultDiv.innerHTML = "<p>Please paste a recipe link first.</p>";
    return;
  }

  recipeResultDiv.innerHTML = "<p>Fetching recipe...</p>";

  const serverUrl =
    "https://dinnerplanner-server.onrender.com/api/recipe?url=" +
    encodeURIComponent(url);

  try {

    const response = await fetch(serverUrl);

    const recipeData = await response.json();

    if (!response.ok) {
      throw new Error(recipeData.error || "Failed to fetch recipe");
    }

    if (!recipeData.recipeIngredient ||
        !recipeData.recipeInstructions) {
      throw new Error("Recipe data was incomplete");
    }

    const ingredientsHTML =
      recipeData.recipeIngredient
        .map(item => `<li>${item}</li>`)
        .join("");

    const instructionsHTML =
      recipeData.recipeInstructions
        .map(item => `<li>${item}</li>`)
        .join("");

    recipeResultDiv.innerHTML = `
      <h3>Ingredients</h3>
      <ul>
        ${ingredientsHTML}
      </ul>

      <h3>Instructions</h3>
      <ol>
        ${instructionsHTML}
      </ol>
    `;

  } catch (error) {

    console.error("Fetch failed:", error);

    recipeResultDiv.innerHTML = `
      <p>
        Couldn't fetch this recipe.
      </p>
      <p>
        ${error.message}
      </p>
    `;
  }
});