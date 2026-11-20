export const scalarTypes = ['int', 'long long', 'double', 'char', 'bool', 'string'];
export const containerTypes = [
  'vector', 'stack', 'queue', 'deque', 'priority_queue_max',
  'priority_queue_min', 'set', 'map', 'unordered_map', 'pair',
];

type Arg = { type: string; name?: string; [key: string]: unknown };
export const text = (name: string, value: string): Arg => ({ type: 'field_input', name, text: value });
export const value = (name: string, check?: string): Arg => ({ type: 'input_value', name, check });
export const body = (name: string): Arg => ({ type: 'input_statement', name });
export const check = (name: string, checked: boolean): Arg => ({ type: 'field_checkbox', name, checked });
export const select = (name: string, values: string[], labels = values): Arg => ({
  type: 'field_dropdown', name, options: values.map((item, i) => [labels[i], item]),
});

export const categories = {
  structure: '程序结构', variables: '声明与变量', io: '输入输出',
  operators: '运算与逻辑', control: '分支与循环', methods: '类型方法与算法',
};

export function define(
  style: keyof typeof categories, type: string, label: string, message0: string,
  args0: Arg[], shape: 'statement' | 'root' | 'expression' | 'Number' | 'Boolean' | 'String',
  keywords: string[] = [],
) {
  type = `algo_${type}`;
  return {
    catalog: { type, label, category: categories[style], keywords: [...keywords, ...type.slice(5).split('_')] },
    json: {
      type, message0, args0, style: `${style}_blocks`, tooltip: label,
      ...(shape === 'statement' ? { previousStatement: null, nextStatement: null } :
        shape === 'root' ? {} : { output: shape === 'expression' ? null : shape, inputsInline: true }),
    },
  };
}
