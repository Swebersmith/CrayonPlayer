/** @jest-environment node */
import { catalog360, catalogDetail, catalogSogou } from '../src/video-catalog';
import { officialPage, parserPage } from '../src/library-sources';

it('extracts concrete official pages from movie and variety result schemas',()=>{
  const data={code:0,data:{longData:{rows:[
    {cat_id:'2',en_id:'show',titleTxt:'西游记',year:'1986',playlinks:{qiyi:'http://www.iqiyi.com/v_19rrjaail0.html',bad:'https://evil.example/video'}},
    {cat_id:'3',en_id:'mango',titleTxt:'歌手',playlinks:{imgo:[{url:'http://www.mgtv.com/b/327378/5423583.html'}]}},
  ]}}};
  const items=catalog360(data);
  expect(items).toHaveLength(2);
  expect(items[0].links).toEqual([{url:'https://www.iqiyi.com/v_19rrjaail0.html',platform:'iqiyi'}]);
  expect(items[1].platforms).toEqual(['mgtv']);
});

it('normalizes episode lists and variety periods without inventing playable URLs',()=>{
  const series=catalogDetail({errno:0,data:{title:'西游记',total:25,playlinks:{qiyi:'https://www.iqiyi.com/v_default.html'},allepidetail:{qiyi:[{url:'https://www.iqiyi.com/v_episode.html',playlink_num:'1'},{url:'javascript:alert(1)',playlink_num:'2'}]}}},'iqiyi');
  expect(series.episodes).toEqual([{platform:'iqiyi',url:'https://www.iqiyi.com/v_episode.html',title:'第 1 集'}]);
  const variety=catalogDetail({errno:0,data:{title:'歌手',playlinks:null,defaultepisode:[{name:'第13期',url:'http://www.mgtv.com/b/327378/5423583.html'}]}},'mgtv');
  expect(variety.platforms).toEqual(['mgtv']); expect(variety.episodes[0].title).toBe('第13期');
});

it('reads Sogou public destination fields and rejects links outside the five platforms',()=>{
  const encode=(value:string)=>{let bits=0,buffer=0,result='';for(const byte of Buffer.from(value)){buffer=buffer<<8|byte;bits+=8;while(bits>=5){bits-=5;result+='abcdefghijklmnopqrstuvwxyz234567'[buffer>>>bits&31];}}if(bits)result+='abcdefghijklmnopqrstuvwxyz234567'[buffer<<(5-bits)&31];return result;};
  const html=['https://www.bilibili.com/video/BV1fa4y1w7LN/','https://evil.example/video'].map(url=>`<a href="/vc/np?type=play&amp;link=${encode('hash\t123\tnormal_play\t'+url)}" title="西游记">西游记</a>`).join('');
  const result=catalogSogou(html);
  expect(result).toHaveLength(1);expect(result[0].links[0].platform).toBe('bilibili');
});

it('rejects home/search pages and domain lookalikes, preserving required video IDs',()=>{
  for(const url of ['https://www.iqiyi.com/','https://v.qq.com/x/search/?q=foo','https://v.qq.com.evil.example/x/cover/a.html','javascript:alert(1)'])expect(officialPage(url)).toBeUndefined();
  expect(officialPage('https://v.youku.com/video?vid=XNDQzNDUwNTE4NA==')!.url).toBe('https://v.youku.com/v_show/id_XNDQzNDUwNTE4NA==.html');
  expect(()=>parserPage('ql','西游记')).toThrow();
});
