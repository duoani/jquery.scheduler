(function ($) {
  'use strict';

  var serialize = function (data, accuracy) {
    accuracy = accuracy > 0 ? accuracy : 1;
    var chunkSize = 24 * accuracy;
    var res = [];
    var i = 0;
    for (i = 0; i < chunkSize * 7; i++) {
      res[i] = 0;
    }
    for (i = 0; i < 7; i++) {
      var row = data[i + 1];
      if (!row) {continue;}
      for (var j = 0, rowLen = row.length; j < rowLen; j++) {
        res[i * chunkSize + row[j]] = 1;
      }
    }

    return res.join('');
  };

  var parse = function (strSequence, accuracy) {
    accuracy = accuracy > 0 ? accuracy : 1;
    var chunkSize = 24 * accuracy;
    var res = {};
    for (var i = 0, row = 1, len = strSequence.length; i < len; i++) {
      var col = i % chunkSize;
      if (strSequence[i] === '1') {
        !res[row] && (res[row] = []);
        res[row].push(col);
      }
      if ((i + 1) % chunkSize === 0) {
        row++;
      }
    }

    return res;
  };

  var toStr = function (currentSelectRange) {
    return Object.prototype.toString.call(currentSelectRange);
  };
  // it only does '%s', and return '' when arguments are undefined
  var sprintf = function (str) {
    var args = arguments;
    var flag = true;
    var i = 1;

    str = str.replace(/%s/g, function () {
      var arg = args[i++];

      if (typeof arg === 'undefined') {
        flag = false;
        return '';
      }
      return arg;
    });
    return flag ? str : '';
  };

  /**
   * Return an interger array of ascending range form 'form' to 'to'.
   * @param {Number} form
   * @param {Number} to
   * @return {Array}
   */
  var makeRange = function (from, to) {
    // 保证 from <= to
    if (from > to) {
      from = from + to;
      to = from - to;
      from = from - to;
    }

    var res = [];
    for (var i = from; i <= to; i++) {
      res.push(i);
    }
    return res;
  };

  var makeMatrix = function (startCoord, endCoord) {
    var matrix = {};
    var colArr = makeRange(startCoord[1], endCoord[1]);
    var fromRow = startCoord[0] < endCoord[0] ? startCoord[0] : endCoord[0];
    var steps = Math.abs(startCoord[0] - endCoord[0]) + 1;
    for (var i = 0; i < steps; i++) {
      matrix[fromRow + i] = colArr.slice(0);
    }
    return matrix;
  };

  /**
   * Merge to arrays, return an new array.
   * @param {Array} origin
   * @param {Array} addition
   */
  var mergeArray = function (origin, addition) {
    var hash = {};
    var res = [];

    origin.forEach(function (item, i) {
      hash[item] = 1;
      res[i] = item;
    });

    addition.forEach(function (item) {
      if (!hash[item]) {
        res.push(item);
      }
    });

    return res.sort(function (num1, num2) {
      return num1 - num2;
    });
  };

  /**
   * 去当前数组中去除指定集合，返回新数组
   * @param {Array} origin 原数组
   * @param {Array} reject 要去除的数组
   */
  var rejectArray = function (origin, reject) {
    var hash = {};
    var res = [];

    reject.forEach(function (item, i) {
      hash[item] = i;
    });

    origin.forEach(function (item) {
      if (!hash.hasOwnProperty(item)) {
        res.push(item);
      }
    });

    return res.sort(function (num1, num2) {
      return num1 - num2;
    });
  };

  // 选择模式
  var SelectMode = {
    JOIN: 1, // 合并模式，添加到选区
    MINUS: 2, // 减去模式，从之前的选区中减去
    REPLACE: 3, // 替换模式，弃用之前的选区，直接使用给定的选区作为最终值
    NONE: 0
  };

  var Scheduler = function (el, options) {
    this.$el = $(el);
    if (!this.$el.is('table')) {
      this.$el = $('<table></table>').appendTo(this.$el);
    }

    // 自定义项
    this.options = options;
    // 选择模式
    this.selectMode = SelectMode.NONE;
    this.startCoord = null;
    this.endCoord = null;
    // 控件的数据对象，所有操作不会更改 this.options.data
    this.data = $.extend(true, {}, this.options.data);
    this.init();
  };

  // 默认项
  Scheduler.DEFAULTS = {
    locale: 'en', // i18n
    accuracy: 1, // how many cells of an hour
    data: [], // selected cells
    footer: true,
    multiple: true,
    disabled: false,
    // event callbacks
    onDragStart: $.noop,
    onDragMove: $.noop,
    onDragEnd: $.noop,
    onSelect: $.noop,
    onRender: $.noop
  };

  // Language
  Scheduler.LOCALES = {};

  // Simplified Chinese
  Scheduler.LOCALES['zh-cn'] = Scheduler.LOCALES.zh = {
    AM: '上午',
    PM: '下午',
    TIME_TITLE: '时间',
    WEEK_TITLE: '星期',
    WEEK_DAYS: ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'],
    DRAG_TIP: '可拖动鼠标选择时间段',
    RESET: '清空选择'
  };

  // English
  Scheduler.LOCALES['en-US'] = Scheduler.LOCALES.en = {
    AM: 'AM',
    PM: 'PM',
    TIME_TITLE: 'TIME',
    WEEK_TITLE: 'DAY',
    WEEK_DAYS: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
    DRAG_TIP: 'Drag to select hours',
    RESET: 'Reset Selected'
  };

  // Template
  Scheduler.TEMPLATES = {
    HALF_DAY_ROW: '<tr>' +
      '<th rowspan="2" class="slash">' +
      '<div class="scheduler-time-title">%s</div>' +
      '<div class="scheduler-week-title">%s</div>' +
      '</th>' +
      '<th class="scheduler-half-toggle" data-half-toggle="1" colspan="%s">%s</th>' +
      '<th class="scheduler-half-toggle" data-half-toggle="2" colspan="%s">%s</th>' +
      '</tr>',
    HOUR_HEAD_CELL: '<th class="scheduler-hour-toggle" data-hour-toggle="%s" colspan="%s">%s</th>',
    DAY_ROW: '<tr data-index="%s"><td class="scheduler-day-toggle" data-day-toggle="%s">%s</td>%s</tr>',
    HOUR_CELL: '<td class="scheduler-hour%s" data-row="%s" data-col="%s"></td>',
    FOOT_ROW: '<tr><td colspan="%s"><span class="scheduler-tips">%s</span><a class="scheduler-reset">%s</a></td></tr>'
  };

  // Util
  Scheduler.Util = {
    parse: parse,
    serialize: serialize
  };

  var proto = Scheduler.prototype;

  proto.init = function () {
    this.initLocale();
    this.initTable();
    this.options.onRender.call(this.$el);
  };

  proto.initLocale = function () {
    var me = this;
    if (me.options.locale) {
      var parts = me.options.locale.toLowerCase().split(/-|_/);
      if (parts[1]) {
        parts[1] = parts[1].toUpperCase();
      }
      if ($.fn.scheduler.locales[me.options.locale]) {
        // locale as requested
        $.extend(me.options, $.fn.scheduler.locales[me.options.locale]);
      } else if ($.fn.scheduler.locales[parts.join('-')]) {
        // locale with sep set to - (in case original was specified with _)
        $.extend(me.options, $.fn.scheduler.locales[parts.join('-')]);
      } else if ($.fn.scheduler.locales[parts[0]]) {
        // short locale language code (i.e. 'en')
        $.extend(me.options, $.fn.scheduler.locales[parts[0]]);
      }
    }
  };

  proto.initTable = function () {
    this.$el.addClass('scheduler');
    if (this.options.disabled) {
      this.$el.addClass('scheduler-disabled');
    }
    this.initHead();
    this.initBody();
    if (this.options.footer) {
      this.initFoot();
    }
  };

  proto.initHead = function () {
    var me = this;
    me.$head = me.$el.find('>thead');
    if (!me.$head.length) {
      me.$head = $('<thead></thead>').appendTo(me.$el);
    }
    me.$head.append(me.getHeadHtml());

    // toggle select half day
    me.$head.on('click', '.scheduler-half-toggle', me.onToggleHalfDay.bind(me));
    // toggle select an hour
    me.$head.on('click', '.scheduler-hour-toggle', me.onToggleHour.bind(me));
  };

  proto.initBody = function () {
    var me = this;

    me.$body = me.$el.find('>tbody');
    if (!me.$body.length) {
      me.$body = $('<tbody></tbody>').appendTo(me.$el);
    }
    me.$body.append(me.getBodyHtml(me.options.data));

    // toggle select day
    me.$body.on('click', '.scheduler-day-toggle', me.onToggleDay.bind(me));
    // range toggle select hour
    me.$body.on('mousedown', '.scheduler-hour', me.onMouseDown.bind(me))
      .on('mousemove', '.scheduler-hour', me.onMouseMove.bind(me))
      .on('mouseup', '.scheduler-hour', me.onMouseUp.bind(me));
  };

  proto.initFoot = function () {
    var me = this;
    me.$foot = me.$el.find('>tfoot');
    if (!me.$foot.length) {
      me.$foot = $('<tfoot></tfoot>').appendTo(me.$el);
    }
    me.$foot.append(me.getFootHtml());
    me.$foot.on('click', '.scheduler-reset', me.onReset.bind(me));
  };

  proto.getHeadHtml = function (data) {
    var me = this;
    var options = me.options;
    me.$head.append(sprintf($.fn.scheduler.templates.HALF_DAY_ROW,
                            options.TIME_TITLE, // title: time
                            options.WEEK_TITLE, // title: week
                            me.options.accuracy * 12, // row span
                            options.AM, // title: 上午
                            me.options.accuracy * 12, // row span
                            options.PM // title: 下午
                           ));

    var hours = '';
    for (var i = 0; i < 24; i++) {
      hours += sprintf($.fn.scheduler.templates.HOUR_HEAD_CELL,
                       i, // hour indexs
                       options.accuracy, // row span
                       i // hour text
                      );
    }
    return sprintf('<tr>%s</tr>', hours);
  };

  proto.getFootHtml = function () {
    var me = this;
    var options = me.options;
    return sprintf(
      $.fn.scheduler.templates.FOOT_ROW,
      options.accuracy * 24 + 1,
      options.DRAG_TIP,
      options.RESET
    );
  };

  proto.getBodyHtml = function (data) {
    var me = this;
    var options = me.options;
    var rows = '';
    var cellOfRow = options.accuracy * 24;

    for (var i = 1; i <= 7; i++) {
      var cells = '';
      var selectedHours = data[i];
      for (var j = 0; j < cellOfRow; j++) {
        cells += sprintf(
          $.fn.scheduler.templates.HOUR_CELL,
          selectedHours && ~selectedHours.indexOf(j) ? ' scheduler-active' : '',
          i,
          j
        );
      }
      rows += sprintf(
        $.fn.scheduler.templates.DAY_ROW,
        i,
        i,
        options.WEEK_DAYS[i - 1],
        cells
      );
    }

    return rows;
  };

  // toggle select one day
  proto.onToggleDay = function (e) {
    if (this.options.disabled) {
      return;
    }
    var index = $(e.target).parent().data('index');
    var startCoord = [index, 0]; // [row, col] row start form 1
    var endCoord = [index, 24 * this.options.accuracy - 1];
    var selectMode = this.getRangeSelectMode(startCoord, endCoord);
    this.updateToggle(startCoord, endCoord, selectMode);
  };

  // toggle select half day
  proto.onToggleHalfDay = function (e) {
    if (this.options.disabled) {
      return;
    }
    var index = $(e.target).data('halfToggle'); // index = 1 | 2
    var fromIndex = (index - 1) * 12 * this.options.accuracy;
    var toIndex = fromIndex + 12 * this.options.accuracy - 1;
    var startCoord = [1, fromIndex]; // [row, col] row start form 1
    var endCoord = [7, toIndex];
    var selectMode = this.getRangeSelectMode(startCoord, endCoord);
    this.updateToggle(startCoord, endCoord, selectMode);
  };

  // toggle select an hour
  proto.onToggleHour = function (e) {
    if (this.options.disabled) {
      return;
    }
    var index = $(e.target).data('hourToggle'); // index = 1 | 2
    var fromIndex = index * this.options.accuracy;
    var toIndex = fromIndex + this.options.accuracy - 1;
    var startCoord = [1, fromIndex]; // [row, col] row start form 1
    var endCoord = [7, toIndex];
    var selectMode = this.getRangeSelectMode(startCoord, endCoord);
    this.updateToggle(startCoord, endCoord, selectMode);
  };

  proto.onMouseDown = function (e) {
    if (this.options.disabled) {
      return;
    }
    this.moving = true;
    var $cell = $(e.target);
    this.startCoord = [$cell.data('row'), $cell.data('col')];
    this.endCoord = this.startCoord.slice(0);
    this.selectMode = this.getCellSelectMode(this.startCoord);
    this.updateRange(this.startCoord, this.endCoord, this.selectMode);
    this.options.onDragStart.call(this.$el, this.cache);
  };

  proto.onMouseMove = function (e) {
    if (!this.moving) {
      return false;
    }
    var $cell = $(e.target);
    var row = $cell.data('row');
    var col = $cell.data('col');
    if (!this.selectMode || !this.startCoord || (this.endCoord &&
                                                 this.endCoord[0] === row &&
                                                 this.endCoord[1] === col)
       ) {
      return false;
    }
    this.endCoord = [$cell.data('row'), $cell.data('col')];
    this.updateRange(this.startCoord, this.endCoord, this.selectMode);
    this.options.onDragMove.call(this.$el, this.cache);
  };

  proto.onMouseUp = function (e) {
    if (!this.moving) {
      return false;
    }
    // 起始点都在同一个位置
    if (this.startCoord[0] === this.endCoord[0] &&
        this.startCoord[1] === this.endCoord[1]) {
      this.updateRange(this.startCoord, this.endCoord, this.selectMode);
    }
    this.options.onDragEnd.call(this.$el, this.cache);
    this.end();
  };

  /**
   * 根据当前的选中坐标系更新视图，并更新选中数据
   * @param {Array} startCoord 起始坐标 [row, col]
   * @param {Array} endCoord 终结坐标 [row, col]
   * @param {SelectMode} selectMode 选择模式
   */
  proto.updateToggle = function (startCoord, endCoord, selectMode) {
    this.updateRange(startCoord, endCoord, selectMode);
    this.end();
  };

  /**
   * 根据当前的选中坐标系更新视图
   * @param {Array} startCoord 起始坐标 [row, col]
   * @param {Array} endCoord 终结坐标 [row, col]
   * @param {SelectMode} selectMode 选择模式
   */
  proto.updateRange = function (startCoord, endCoord, selectMode) {
    var currentSelectRange = makeMatrix(startCoord, endCoord);
    this.cache = this.merge(this.data, currentSelectRange, selectMode);
    this.update(this.cache);
  };

  /**
   * 更新视图
   * @param {Object} data 选中的时间集合
   */
  proto.update = function (data) {
    this.$body.html(this.getBodyHtml(data));
  };

  // 并更新选中数据
  proto.end = function () {
    this.data = this.cache;
    this.cache = null;
    this.moving = false;
    this.startCoord = null;
    this.endCoord = null;
    this.selectMode = SelectMode.NONE;
    this.options.onSelect.call(this.$el, this.val());
  };

  proto.onReset = function () {
    if (this.options.disabled) {
      return;
    }
    this.val({});
    this.options.onSelect.call(this.$el, this.val());
  };

  /**
   * 根据选择模式合并合个集合
   * @param {Object} origin 上一次选中的数据
   * @param {Object} current 当前选中的数据
   * @param {Number} selectMode 选择模式 {0: none, 1: 选择（合并）模式, 2: 排除模式（从选区中减去）}
   */
  proto.merge = function (origin, current, selectMode) {
    var res = {};
    // 替换模式下，弃用之前的选区，直接使用当前选区
    if (selectMode === SelectMode.REPLACE) {
      for (var i = 1; i <= 7; i++) {
        if (current[i] && current[i].length) {
          res[i] = current[i].slice(0);
        }
      }
      return res;
    }
    for (var i = 1; i <= 7; i++) {
      if (!current[i]) {
        if (origin[i] && origin[i].length) {
          res[i] = origin[i].slice(0);
        }
        continue;
      }
      if (origin[i] && origin[i].length) {
        var m = selectMode === SelectMode.JOIN ?
          mergeArray(origin[i], current[i]) :
          rejectArray(origin[i], current[i]);
        m.length && (res[i] = m);
      } else if (selectMode === SelectMode.JOIN) {
        res[i] = current[i].slice(0);
      }
    }
    return res;
  };

  /**
   * 根据当前选中的范围内时间格式的空闲情况，决定是全选还是全不选
   * 全空闲：总时间格目 === 空闲时间格数目
   * 部分空闲：总时间格目 !== 空闲时间格数目
   * 无空闲：空闲时间格数目 === 0
   * 状态切换：
   * 当前范围全空闲 > 采用合并模式，全选当前范围
   * 部分空闲 > 采用合并模式，全选当前范围
   * 无空闲 > 采用合并模式，全不选当前范围
   *
   * @param {Array} startCoord 起始坐标 [row, col]
   * @param {Array} endCoord 终结坐标 [row, col]
   * @return {SelectMode}
   */
  proto.getRangeSelectMode = function (startCoord, endCoord) {
    if (!this.options.multiple) {
      return SelectMode.REPLACE;
    }
    var rowRange = this.sortCoord(startCoord[0], endCoord[0]);
    var colRange = this.sortCoord(startCoord[1], endCoord[1]);
    var startRow = rowRange[0];
    var endRow = rowRange[1];
    var startCol = colRange[0];
    var endCol = colRange[1];
    var rows = endRow - startRow + 1;
    var cols = endCol - startCol + 1;
    var total = rows * cols;

    // 计算已使用的时间格子
    // TODO 未过滤 disabled 的格子
    var used = 0;
    for (var i = 0; i < rows; i++) {
      var day = startRow + i;
      var data = this.data[day];
      if (!data) {
        continue;
      }
      for (var j = 0; j < data.length; j++) {
        if (data[j] >= startCol && data[j] <= endCol) {
          used++;
        }
      }
    }

    return total === used ? SelectMode.MINUS : SelectMode.JOIN;
  };

  /**
   * 根据当前选中的时间格式的空闲情况，决定是全选还是全不选
   * 状态切换：
   * 当前为单选模式(multiple=false)，-> 替换模式
   * 当前选中时间段为空闲 -> 全选不
   * 当前选中时间段为无空闲 - > 全不选
   *
   * @param {Array} startCoord 起始坐标 [row, col]
   * @return {SelectMode}
   */
  proto.getCellSelectMode = function (coord) {
    if (!this.options.multiple) {
      return SelectMode.REPLACE;
    }
    // TODO 未过滤 disabled 的格子
    var day = this.data[coord[0]];
    return day && ~day.indexOf(coord[1]) ? SelectMode.MINUS : SelectMode.JOIN;
  };

  proto.sortCoord = function (num1, num2) {
    if (num1 > num2) {
      return [num2, num1];
    }
    return [num1, num2];
  };

  proto.disable = function () {
    this.$el.toggleClass('scheduler-disabled', true);
    this.options.disabled = true;
  };

  proto.enable = function () {
    this.$el.toggleClass('scheduler-disabled', false);
    this.options.disabled = false;
  };

  /**
   * 如果无传参，则作为 Getter, 否则为 Setter
   * @param {Array} data optional 选中的内容
   * @return {Array} 返回当前选中的内容
   */
  proto.val = function (data) {
    // setter
    if (toStr(data) === '[object Object]') {
      // TODO 数据结构校验
      this.data = data;
      this.update(data);

    } else { // getter
      return this.merge(this.data, {}, SelectMode.JOIN);
    }
  };

  proto.destroy = function () {
    this.$el.removeClass('scheduler').empty();
  };

  $.extend(Scheduler.DEFAULTS, Scheduler.LOCALES.zh);

  // SCHEDULER PLUGIN DEFINITION
  // ---------------------------

  var apiMethods = [
    'val',
    'destroy',
    'disable',
    'enable'
  ];

  // Set as a jQuery plugin
  $.fn.scheduler = function (option) {
    var value;
    var args = Array.prototype.slice.call(arguments, 1);

    this.each(function () {
      var $this = $(this);
      var data = $this.data('scheduler');
      var options = $.extend({}, Scheduler.DEFAULTS, $this.data(),
                         typeof option === 'object' && option);

      if (typeof option === 'string') {
        if ($.inArray(option, apiMethods) < 0) {
          throw new Error('Unknown method: ' + option);
        }

        if (!data) {
          return;
        }

        value = data[option].apply(data, args);

        if (option === 'destroy') {
          $this.removeData('scheduler');
        }
      }

      if (!data) {
        $this.data('scheduler', (data = new Scheduler(this, options)));
      }
    });

    return typeof value === 'undefined' ? this : value;
  };

  // Exports settings
  $.fn.scheduler.defaults = Scheduler.DEFAULTS;
  $.fn.scheduler.templates = Scheduler.TEMPLATES;
  $.fn.scheduler.locales = Scheduler.LOCALES;
  $.fn.scheduler.util = Scheduler.Util;
})(jQuery);
