/**
 * @file Search history persistence and favorites grid orchestration.
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;

    function rt() {
        if (!runtime) {
            throw new Error('[SearchFavorites] Orchestration runtime not bound');
        }
        return runtime;
    }

    function FAV() { return rt().favorites(); }

    function addToSearchHistory(query, resultName, lat, lon) {
        if (query && lat != null && lon != null) {
            rt().call.recordRecentDestination(resultName || query, lat, lon, 'search');
        }
        rt().call.getSupabaseAccessToken().then((token) => {
            if (!token) return;
            const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
            return fetch('/api/search-history', {
                method: 'POST',
                headers,
                body: JSON.stringify({ query, result_name: resultName, lat, lon }),
            });
        }).catch((error) => console.error('Error adding to search history:', error));
    }

    function mountFavoriteGridItem(grid, fav, handlers) {
        const favMod = FAV();
        const spec = favMod.buildFavoriteGridItemSpec(fav, { escapeHtml: rt().call.escapeHtml });
        const container = document.createElement('div');
        container.className = spec.container.className;
        container.style.cssText = spec.container.style;

        const btn = document.createElement('button');
        btn.className = spec.mainButton.className;
        btn.style.cssText = spec.mainButton.style;
        btn.innerHTML = spec.mainButton.html;
        btn.onclick = () => handlers.onSelect(fav);

        const editBtn = document.createElement('button');
        editBtn.innerHTML = spec.editButton.html;
        editBtn.title = spec.editButton.title;
        editBtn.style.cssText = spec.editButton.style;
        editBtn.onclick = (e) => {
            e.stopPropagation();
            handlers.onEdit(fav);
        };

        const delBtn = document.createElement('button');
        delBtn.innerHTML = spec.deleteButton.html;
        delBtn.title = spec.deleteButton.title;
        delBtn.style.cssText = spec.deleteButton.style;
        delBtn.onclick = (e) => {
            e.stopPropagation();
            handlers.onDelete(fav);
        };

        container.appendChild(btn);
        container.appendChild(editBtn);
        container.appendChild(delBtn);
        grid.appendChild(container);
    }

    function loadFavorites() {
        const favMod = FAV();
        rt().call.fetchJsonWithAuth('/api/favorites')
            .then(({ res, data }) => {
                const section = document.getElementById('favoritesSection');
                const grid = document.getElementById('favoritesGrid');
                grid.innerHTML = '';

                if (res.status === 401) {
                    section.style.display = 'none';
                    return;
                }

                const favorites = data.success && data.favorites ? data.favorites : [];
                if (favMod.shouldShowFavoritesSection(false, favorites.length)) {
                    favorites.forEach((fav) => {
                        mountFavoriteGridItem(grid, fav, {
                            onSelect: (item) => {
                                document.getElementById('end').value = item.name;
                                document.getElementById('end').dataset.lat = item.lat;
                                document.getElementById('end').dataset.lon = item.lon;
                                document.getElementById('end').dataset.displayName = item.name;
                                addToSearchHistory(item.name, item.name, item.lat, item.lon);
                                rt().call.expandBottomSheet();
                                rt().call.showStatus(favMod.getFavoriteSelectStatusMessage(item.name), 'success');
                            },
                            onEdit: editFavorite,
                            onDelete: deleteFavorite,
                        });
                    });

                    section.style.display = 'block';
                } else {
                    section.style.display = 'none';
                }
            })
            .catch((error) => console.error('Error loading favorites:', error));
    }

    function editFavorite(fav) {
        const favMod = FAV();
        const newName = prompt('Edit name:', fav.name);
        if (!newName || newName === fav.name) return;

        const newCategory = prompt('Edit category:', fav.category);

        rt().call.getSupabaseAccessToken().then((token) => fetch('/api/favorites', {
            method: 'PUT',
            headers: favMod.buildFavoriteAuthHeaders(token),
            body: favMod.buildFavoriteUpdateBody(fav, newName, newCategory),
        }))
            .then((r) => r.json())
            .then((data) => {
                if (data.success) {
                    rt().call.showStatus(favMod.getFavoriteUpdatedStatusMessage(newName), 'success');
                    loadFavorites();
                } else {
                    rt().call.showStatus(favMod.getFavoriteApiErrorMessage(data.error), 'error');
                }
            })
            .catch((err) => {
                console.error('Error updating favorite:', err);
                rt().call.showStatus(favMod.getFavoriteActionFailedMessage('update'), 'error');
            });
    }

    function deleteFavorite(fav) {
        const favMod = FAV();
        if (!confirm(favMod.getFavoriteDeleteConfirmMessage(fav.name))) return;

        rt().call.getSupabaseAccessToken().then((token) => fetch('/api/favorites', {
            method: 'DELETE',
            headers: favMod.buildFavoriteAuthHeaders(token),
            body: favMod.buildFavoriteDeleteBody(fav),
        }))
            .then((r) => r.json())
            .then((data) => {
                if (data.success) {
                    rt().call.showStatus(favMod.getFavoriteRemovedStatusMessage(fav.name), 'success');
                    loadFavorites();
                } else {
                    rt().call.showStatus(favMod.getFavoriteApiErrorMessage(data.error), 'error');
                }
            })
            .catch((err) => {
                console.error('Error deleting favorite:', err);
                rt().call.showStatus(favMod.getFavoriteActionFailedMessage('delete'), 'error');
            });
    }

    function addCurrentToFavorites() {
        const favMod = FAV();
        const name = prompt('Enter name for this location (e.g., Home, Work):');
        if (!name) return;

        const category = prompt('Enter category (e.g., home, work, shopping):', 'location');

        rt().call.getSupabaseAccessToken().then((token) => fetch('/api/favorites', {
            method: 'POST',
            headers: favMod.buildFavoriteAuthHeaders(token),
            body: favMod.buildFavoriteCreateBody({
                name: name,
                address: document.getElementById('end').value,
                lat: rt().getCurrentLat(),
                lon: rt().getCurrentLon(),
                category: category || 'location',
            }),
        }))
            .then((response) => response.json())
            .then((data) => {
                if (data.success) {
                    rt().call.showStatus(favMod.getFavoriteAddedStatusMessage(name), 'success');
                    loadFavorites();
                } else {
                    rt().call.showStatus('Error adding to favorites', 'error');
                }
            })
            .catch((error) => {
                rt().call.showStatus('Error: ' + error.message, 'error');
            });
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
    }

    var api = {
        bind: bind,
        addToSearchHistory: addToSearchHistory,
        loadFavorites: loadFavorites,
        editFavorite: editFavorite,
        deleteFavorite: deleteFavorite,
        addCurrentToFavorites: addCurrentToFavorites,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrSearchFavoritesOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
