(() => {
  const customContainer = document.getElementById('cd-page-content');
  // Find the original content area from the hidden Next.js layout
  const originalMain = document.querySelector('main#main-content');

  if (originalMain && customContainer) {
    // Unhide the original main content block
    originalMain.style.display = 'block';
    
    // Hide the original portal's top mobile header/breadcrumb to prevent double headers
    const redundantHeader = originalMain.querySelector('header.sticky');
    if (redundantHeader) redundantHeader.style.display = 'none';

    // Move the content into the new shell
    customContainer.appendChild(originalMain);
  }
})();