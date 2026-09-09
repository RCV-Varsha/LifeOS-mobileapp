export const colors={paper:'#f7f2e8',paperRaised:'#fffdf8',ink:'#20251f',muted:'#625d54',subtle:'#81796d',green:'#486553',greenSoft:'#e5eee7',amber:'#956322',amberSoft:'#fff9ed',line:'#d9d1c3',input:'#aaa193',danger:'#9b3d35'} as const;

export const screen={flexGrow:1 as const,paddingHorizontal:24,paddingTop:54,paddingBottom:42,backgroundColor:colors.paper};
export const typography={eyebrow:{color:colors.green,fontWeight:'800' as const,letterSpacing:1.5},heading:{fontSize:30,lineHeight:37,fontWeight:'700' as const,color:colors.ink,marginTop:8},muted:{color:colors.muted,lineHeight:21}};
export const input={borderWidth:1,borderColor:colors.input,borderRadius:8,padding:11,fontSize:16,color:colors.ink,backgroundColor:colors.paperRaised};
