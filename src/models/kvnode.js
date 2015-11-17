const DEBUG = process.env.EXPRESS_KVSTORE_DEBUG;

const basename = (str) => {
  const parts = str.split('/');
  return '/' + parts.pop();
};

export default ({ bookshelf }) => {
  class Key {
    constructor(_key, chroot) {
      const key = _key.split('/').filter((part) => part !== '');
      this.key = chroot ? (new Key(chroot)).key.concat(key) : key;
    }

    parent() {
      if (!this.key.length) return undefined;
      return new Key(this.key.slice(0, -1).join('/'));
    }

    basename() {
      if (!this.key.length) return undefined;
      return this.key[this.key.length - 1];
    }

    toString(_chroot = '/') {
      const chroot = new Key(_chroot);
      const key = this.key.slice(chroot.key.length);
      return '/' + key.join('/');
    }
  }

  class Kvnode extends bookshelf.Model {
    get idAttribute() { return 'key'; }
    get tableName() { return 'kvnodes'; }
    get hasTimestamps() { return true; }

    // Return child nodes
    nodes() {
      return this.hasMany(Kvnode, 'parent');
    }

    key() {
      return new Key(this.get('key'));
    }

    parse(attrs) {
      return attrs;
    }

    format(attrs) {
      return attrs;
    }

    isDir() {
      return this.get('dir');
    }

    _createParent({ transacting }) {
      const parentKey = this.key().parent();
      if (!parentKey) return Promise.resolve();
      return Kvnode.forge({
        key: parentKey.toString(),
        dir: true,
      }).put({ transacting });
    }

    put({ transacting } = {}) {
      if (!transacting) {
        return bookshelf.transaction((t) => this.put({ transacting: t }));
      }

      this.set('key', this.key().toString());

      const parentKey = this.key().parent();
      if (parentKey) {
        this.set('parent', parentKey.toString());
      }
      return Kvnode.forge({ key: this.key().toString() })
      .fetch({ transacting })
      .then((kvnode) => {
        if (kvnode) {
          if (kvnode.get('dir') !== this.get('dir')) {
            throw new Error(`${this.get('key')}: cannot change dir=${kvnode.get('dir')} to ${this.get('dir')}`);
          }
          return this.save(null, { debug: DEBUG, transacting, method: 'update' });
        }
        return this._createParent({ transacting })
          .then(() => {
            return this.save(null, { debug: DEBUG, transacting, method: 'insert' });
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
      attrs.key = this.key().toString(this.chroot);
      return attrs;
    }

    static root(key = '/') {
      return Kvnode.forge({
        key,
        parent: null,
        dir: true,
      });
    }

    static init({ key: _key, chroot = '/' }) {
      const key = new Key(_key, chroot);
      const kvnode = new Kvnode();
      kvnode.set('key', key.toString());
      kvnode.chroot = chroot;
      return kvnode;
    }
  }
  return Kvnode;
};

