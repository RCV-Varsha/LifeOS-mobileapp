// The self-contained build avoids Node-specific package resolution in Metro.
import MarkdownIt from 'markdown-it/browser';

const parser=new MarkdownIt({html:false,linkify:false,typographer:false});
type Token=ReturnType<typeof parser.parse>[number];
export type MarkdownNode={token:Token;children:MarkdownNode[]};

function tree(tokens:Token[]):MarkdownNode[]{
  const root:MarkdownNode[]=[];
  const stack:MarkdownNode[][]=[root];
  for(const token of tokens){
    if(token.nesting===-1){if(stack.length>1)stack.pop();continue;}
    const node:MarkdownNode={token,children:token.children?tree(token.children):[]};
    stack[stack.length-1]!.push(node);
    if(token.nesting===1)stack.push(node.children);
  }
  return root;
}

export function parseMarkdown(text:string):MarkdownNode[]{return tree(parser.parse(text,{}));}
export function safeMarkdownLink(value:unknown):string|null{
  return typeof value==='string'&&/^(https?:\/\/|mailto:)/i.test(value)?value:null;
}
