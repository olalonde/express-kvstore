import path from 'path';

const basename = (str) => {
  const parts = str.split('/');
  return '/' + parts.pop();
};

export default ({ bookshelf }) => {
  class Kvnode extends bookshelf.Model {
    get idAttribute() { return 'key'; }
    get tableName() { return 'kvnodes'; }
    get hasTimestamps() { return true; }

    // Return child nodes
    nodes() {
      return this.hasMany(Kvnode, 'parent');
    }

    isDir() {
      return this.get('dir');
    }

    _parentKey() {
      const parts = this.get('key').split('/')
        .filter((ele) => ele !== '');
      if (!parts.length) return null;
      parts.pop();
      return '/' + parts.join('/');
    }

    _createParent({ transacting }) {
      return Kvnode.forge({ key: this._parentKey(), dir: true }).put({ transacting });
    }

    put({ transacting } = {}) {
      if (!transacting) {
        return bookshelf.transaction((t) => this.put({ transacting: t }));
      }

      this.set('parent', this._parentKey());
      return Kvnode.forge({ key: this.get('key') })
      .fetch({ transacting })
      .then((kvnode) => {
        if (kvnode) {
          if (kvnode.get('dir') !== this.get('dir')) {
            throw new Error(`${this.get('key')}: cannot change dir=${kvnode.get('dir')} to ${this.get('dir')}`);
          }
          return this.save(null, { transacting, method: 'update' });
        }
        return this._createParent({ transacting })
          .then(() => {
            return this.save(null, { transacting, method: 'insert' });
          });
      });
    }

    toJSON(...args) {
      const attrs = super.toJSON(...args);
      delete attrs.parent;
      if (this.isDir()) {
        delete attrs.value;
        attrs.nodes = attrs.nodes || [];
        attrs.nodes = attrs.nodes
          .map(({ key }) => key)
          .map((key) => basename(key));
      } else {
        delete attrs.nodes;
      }
      if (this.chroot) {
        attrs.key = path.join('/', attrs.key.substr(this.chroot.length));
      }
      return attrs;
    }

    static root(key = '/') {
      return Kvnode.forge({
        key,
        parent: null,
        dir: true,
      });
    }
  }
  return Kvnode;
};

