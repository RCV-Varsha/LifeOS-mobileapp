import { useMemo,type ReactNode } from 'react';
import { Linking,Platform,ScrollView,StyleSheet,Text,View } from 'react-native';
import { parseMarkdown,safeMarkdownLink,type MarkdownNode } from '../services/markdownFormat';
import { colors } from '../ui/theme';

function inline(nodes:MarkdownNode[]):ReactNode[]{
  return nodes.map(({token,children},index)=>{
    switch(token.type){
      case 'text':return token.content;
      case 'softbreak':return ' ';
      case 'hardbreak':return '\n';
      case 'strong_open':return <Text key={index} style={styles.bold}>{inline(children)}</Text>;
      case 'em_open':return <Text key={index} style={styles.italic}>{inline(children)}</Text>;
      case 's_open':return <Text key={index} style={styles.strike}>{inline(children)}</Text>;
      case 'code_inline':return <Text key={index} style={styles.inlineCode}>{token.content}</Text>;
      case 'link_open':{
        const url=safeMarkdownLink(token.attrGet('href'));
        return <Text key={index} accessibilityRole={url?'link':undefined} style={url?styles.link:undefined} onPress={url?()=>{void Linking.openURL(url).catch(()=>undefined);}:undefined}>{inline(children)}</Text>;
      }
      case 'image':return <Text key={index} style={styles.italic}>{token.content||'Image'}</Text>;
      default:return children.length?<Text key={index}>{inline(children)}</Text>:token.content;
    }
  });
}

function block(nodes:MarkdownNode[]):ReactNode[]{
  return nodes.map((node,index)=>{
    const {token,children}=node;
    switch(token.type){
      case 'inline':return <Text key={index} selectable style={styles.body}>{inline(children)}</Text>;
      case 'paragraph_open':return <View key={index} style={styles.paragraph}>{block(children)}</View>;
      case 'heading_open':return <Text key={index} selectable accessibilityRole="header" style={[styles.heading,token.tag==='h1'?styles.h1:token.tag==='h2'?styles.h2:styles.h3]}>{children.map(child=>inline(child.children))}</Text>;
      case 'bullet_list_open':
      case 'ordered_list_open':{
        const start=Number(token.attrGet('start')??1);
        return <View key={index} style={styles.list}>{children.map((item,position)=><View key={position} style={styles.listRow}><Text style={styles.marker}>{token.type==='ordered_list_open'?`${start+position}.`:'•'}</Text><View style={styles.listContent}>{block(item.children)}</View></View>)}</View>;
      }
      case 'blockquote_open':return <View key={index} style={styles.quote}>{block(children)}</View>;
      case 'fence':
      case 'code_block':return <View key={index} style={styles.codeBlock}>{token.info?<Text style={styles.language}>{token.info.split(/\s/)[0]}</Text>:null}<ScrollView horizontal style={styles.horizontal}><Text selectable style={styles.code}>{token.content.replace(/\n$/,'')}</Text></ScrollView></View>;
      case 'hr':return <View key={index} style={styles.rule}/>;
      case 'table_open':return <ScrollView key={index} horizontal style={styles.horizontal}><View style={styles.table}>{block(children)}</View></ScrollView>;
      case 'thead_open':return <View key={index} style={styles.tableHeader}>{block(children)}</View>;
      case 'tbody_open':return <View key={index}>{block(children)}</View>;
      case 'tr_open':return <View key={index} style={styles.tableRow}>{block(children)}</View>;
      case 'th_open':
      case 'td_open':return <View key={index} style={styles.cell}><Text selectable style={[styles.body,token.type==='th_open'&&styles.bold]}>{children.map(child=>inline(child.children))}</Text></View>;
      default:return <View key={index}>{children.length?block(children):<Text selectable style={styles.body}>{token.content}</Text>}</View>;
    }
  });
}

export default function MarkdownText({children}:{children:string}){
  const nodes=useMemo(()=>parseMarkdown(children),[children]);
  return <View style={styles.document}>{block(nodes)}</View>;
}

const mono=Platform.OS==='ios'?'Menlo':'monospace';
const styles=StyleSheet.create({
  document:{gap:12},body:{fontSize:16,lineHeight:26,color:colors.ink},paragraph:{gap:4},
  bold:{fontWeight:'700'},italic:{fontStyle:'italic'},strike:{textDecorationLine:'line-through'},
  heading:{fontWeight:'700',color:colors.ink,marginTop:8},h1:{fontSize:25,lineHeight:33},h2:{fontSize:21,lineHeight:29},h3:{fontSize:18,lineHeight:26},
  list:{gap:10},listRow:{flexDirection:'row',alignItems:'flex-start',gap:10},marker:{minWidth:22,fontSize:16,lineHeight:26,color:colors.green,fontWeight:'600'},listContent:{flex:1,gap:8},
  quote:{borderLeftWidth:3,borderLeftColor:colors.green,backgroundColor:colors.greenSoft,padding:14,gap:10,borderRadius:4},
  link:{color:colors.green,textDecorationLine:'underline'},inlineCode:{fontFamily:mono,fontSize:14,backgroundColor:colors.stone},
  codeBlock:{backgroundColor:colors.stone,borderRadius:12,padding:14,gap:10},code:{fontFamily:mono,fontSize:13,lineHeight:21,color:colors.ink},language:{fontSize:11,color:colors.muted,fontWeight:'700'},
  horizontal:{flexGrow:0,flexShrink:0},rule:{height:1,backgroundColor:colors.line,marginVertical:6},table:{borderWidth:1,borderColor:colors.line,borderRadius:8,overflow:'hidden'},tableHeader:{backgroundColor:colors.greenSoft},tableRow:{flexDirection:'row'},cell:{width:190,padding:12,borderRightWidth:1,borderBottomWidth:1,borderColor:colors.line},
});
