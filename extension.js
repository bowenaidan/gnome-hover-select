/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

export default class HoverSelectExtension extends Extension {
  enable() {
    this._sigIds = [];
    this._motionId = 0;
    this._activateSource = 0;
    this._lastHoveredMetaWindow = null;
    this._overviewVisible = false;

    const overview = Main.overview;

    // start tracking what window is under the pointer once overview is shown
    this._sigIds.push(
      overview.connect('shown', () => {
        this._overviewVisible = true;
        this._lastHoveredMetaWindow = null;

        // Track hover continuously
        if (!this._motionId) {
          this._motionId = global.stage.connect('motion-event', () => {
            if (!this._overviewVisible) return Clutter.EVENT_PROPAGATE;

            const win = this._getHoveredMetaWindow();
            if (win) this._lastHoveredMetaWindow = win;

            return Clutter.EVENT_PROPAGATE;
          });
        }
      })
    );

    this._sigIds.push(
      overview.connect('hiding', () => {
        this._overviewVisible = false;

        const win = this._lastHoveredMetaWindow;

        // activate immediately so the exit animation targets the chosen window
        if (win) {
          if (this._activateSource) {
            GLib.source_remove(this._activateSource);
            this._activateSource = 0;
          }

          const focused = global.display.get_focus_window?.();
          if (!focused || focused !== win) {
            win.activate(global.get_current_time());
          }
        }
      })
    );

    // activate the last hovered window once overview is fully hidden
    this._sigIds.push(
      overview.connect('hidden', () => {
        this._lastHoveredMetaWindow = null;
      })
    );
  }

  disable() {
    const overview = Main.overview;

    for (const id of this._sigIds || [])
      overview.disconnect(id);

    this._sigIds = [];

    if (this._motionId) {
      global.stage.disconnect(this._motionId);
      this._motionId = 0;
    }

    if (this._activateSource) {
      GLib.source_remove(this._activateSource);
      this._activateSource = 0;
    }

    this._lastHoveredMetaWindow = null;
    this._overviewVisible = false;
  }

  _getHoveredMetaWindow() {
    const [x, y] = global.get_pointer();
    const actor = global.stage.get_actor_at_pos(Clutter.PickMode.ALL, x, y);
    if (!actor) return null;

    // walk up actor tree trying several ways GNOME stores MetaWindow
    for (let a = actor; a; a = a.get_parent?.()) {
      // direct metaWindow
      if (a.metaWindow) return a.metaWindow;
      if (typeof a.get_meta_window === 'function') return a.get_meta_window();

      // overview previews can be clones
      if (typeof a.get_source === 'function') {
        const src = a.get_source();
        if (src?.metaWindow) return src.metaWindow;
        if (typeof src?.get_meta_window === 'function') return src.get_meta_window();
      }

      // some actors store the interesting object on _delegate
      const d = a._delegate;
      if (d?.metaWindow) return d.metaWindow;
      if (typeof d?.get_meta_window === 'function') return d.get_meta_window();
      if (typeof d?.getMetaWindow === 'function') return d.getMetaWindow();
    }

    return null;
  }
}
