#!/usr/bin/env python3
"""Attach a standard Windows manifest and Triplem VIP icon to a PE32+ executable.

This runs only in the build workspace. It never modifies an executable on an end-user PC.
The implementation adds a normal .rsrc section, then points the PE resource data-directory
at that section. It supports numeric RT_ICON, RT_GROUP_ICON and RT_MANIFEST resources.
"""
from __future__ import annotations
import os, struct, subprocess, sys, tempfile
from pathlib import Path

RT_ICON = 3
RT_GROUP_ICON = 14
RT_MANIFEST = 24
LANG_EN_US = 0x0409

MANIFEST = b'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">\n  <assemblyIdentity version="3.3.0.0" processorArchitecture="amd64" name="TriplemVIP.Desktop" type="win32"/>\n  <description>Triplem VIP</description>\n  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3"><security><requestedPrivileges><requestedExecutionLevel level="asInvoker" uiAccess="false"/></requestedPrivileges></security></trustInfo>\n  <application xmlns="urn:schemas-microsoft-com:asm.v3"><windowsSettings>\n    <dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true/pm</dpiAware>\n    <dpiAwareness xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">PerMonitorV2,PerMonitor</dpiAwareness>\n    <longPathAware xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">true</longPathAware>\n  </windowsSettings></application>\n</assembly>'''

def align(v, a=4):
    return (v + a - 1) & ~(a - 1)

def parse_ico(path: Path):
    b = path.read_bytes()
    reserved, typ, count = struct.unpack_from('<HHH', b, 0)
    if reserved != 0 or typ != 1 or count < 1:
        raise ValueError('invalid ICO')
    imgs=[]
    for i in range(count):
        off=6+i*16
        width,height,color,res,planes,bits,size,dataoff=struct.unpack_from('<BBBBHHII', b, off)
        data=b[dataoff:dataoff+size]
        if len(data)!=size: raise ValueError('truncated ICO image')
        imgs.append((width,height,color,res,planes,bits,data))
    return imgs

def group_icon(imgs):
    out=bytearray(struct.pack('<HHH',0,1,len(imgs)))
    for i,(w,h,c,r,p,b,data) in enumerate(imgs,1):
        out += struct.pack('<BBBBHHIH',w,h,c,r,p,b,len(data),i)
    return bytes(out)

def dir_header(id_count):
    return struct.pack('<IIHHHH',0,0,0,0,0,id_count)

def build_rsrc(base_rva:int, ico_path:Path):
    imgs=parse_ico(ico_path)
    resources=[]
    for i,img in enumerate(imgs,1): resources.append((RT_ICON,i,img[6]))
    resources.append((RT_GROUP_ICON,1,group_icon(imgs)))
    resources.append((RT_MANIFEST,1,MANIFEST))
    by_type={}
    for typ,rid,data in resources: by_type.setdefault(typ,[]).append((rid,data))
    types=sorted(by_type)

    # Allocate all directory structures first.
    cursor = 16 + 8*len(types)  # root
    type_offsets={}
    lang_offsets={}
    for typ in types:
        items=sorted(by_type[typ])
        type_offsets[typ]=cursor
        cursor += 16 + 8*len(items)
        for rid,_ in items:
            lang_offsets[(typ,rid)] = cursor
            cursor += 16 + 8
    cursor=align(cursor,4)
    data_entry_offsets={}
    for typ in types:
        for rid,_ in sorted(by_type[typ]):
            data_entry_offsets[(typ,rid)] = cursor
            cursor += 16
    cursor=align(cursor,4)
    data_offsets={}
    for typ in types:
        for rid,data in sorted(by_type[typ]):
            data_offsets[(typ,rid)] = cursor
            cursor += len(data)
            cursor=align(cursor,4)
    out=bytearray(cursor)

    # Root directory and type entries.
    out[0:16]=dir_header(len(types))
    eo=16
    for typ in types:
        struct.pack_into('<II',out,eo,typ,0x80000000|type_offsets[typ]); eo+=8

    # Type directories, language directories and data entries.
    for typ in types:
        items=sorted(by_type[typ])
        to=type_offsets[typ]
        out[to:to+16]=dir_header(len(items))
        eo=to+16
        for rid,data in items:
            struct.pack_into('<II',out,eo,rid,0x80000000|lang_offsets[(typ,rid)]); eo+=8
            lo=lang_offsets[(typ,rid)]
            out[lo:lo+16]=dir_header(1)
            struct.pack_into('<II',out,lo+16,LANG_EN_US,data_entry_offsets[(typ,rid)])
            de=data_entry_offsets[(typ,rid)]
            do=data_offsets[(typ,rid)]
            struct.pack_into('<IIII',out,de,base_rva+do,len(data),0,0)
            out[do:do+len(data)]=data
    return bytes(out)

def pe_info(path:Path):
    b=path.read_bytes()
    pe=struct.unpack_from('<I',b,0x3c)[0]
    if b[pe:pe+4]!=b'PE\0\0': raise ValueError('not PE')
    coff=pe+4
    nsec=struct.unpack_from('<H',b,coff+2)[0]
    opt_size=struct.unpack_from('<H',b,coff+16)[0]
    opt=coff+20
    magic=struct.unpack_from('<H',b,opt)[0]
    if magic!=0x20b: raise ValueError('expected PE32+')
    image_base=struct.unpack_from('<Q',b,opt+24)[0]
    section_alignment=struct.unpack_from('<I',b,opt+32)[0]
    sect=opt+opt_size
    sections=[]
    for i in range(nsec):
        o=sect+i*40
        name=b[o:o+8].rstrip(b'\0').decode('ascii','replace')
        vs,va,rawsz,rawptr=struct.unpack_from('<IIII',b,o+8)
        sections.append((name,vs,va,rawsz,rawptr,o))
    return b,pe,opt,image_base,section_alignment,sections

def patch_resource_directory(path:Path, rva:int, size:int, image_size:int):
    b=bytearray(path.read_bytes())
    pe=struct.unpack_from('<I',b,0x3c)[0]; opt=pe+4+20
    # PE32+ data directories start at optional header +112. Resource is index 2.
    struct.pack_into('<II',b,opt+112+2*8,rva,size)
    # SizeOfImage must include the appended resource section.
    struct.pack_into('<I',b,opt+56,image_size)
    path.write_bytes(b)

def patch_pe_checksum(path: Path):
    """Compute and write the standard PE checksum after all resource/header changes."""
    data=bytearray(path.read_bytes())
    pe=struct.unpack_from('<I',data,0x3c)[0]
    opt=pe+4+20
    checksum_off=opt+64
    struct.pack_into('<I',data,checksum_off,0)
    total=0
    n=len(data)
    i=0
    while i+1<n:
        if i==checksum_off or i==checksum_off+2:
            word=0
        else:
            word=data[i] | (data[i+1]<<8)
        total=(total+word)&0xffffffff
        total=(total&0xffff)+(total>>16)
        i+=2
    if i<n:
        total=(total+data[i])&0xffffffff
        total=(total&0xffff)+(total>>16)
    total=(total&0xffff)+(total>>16)
    total=(total&0xffff)+n
    total&=0xffffffff
    struct.pack_into('<I',data,checksum_off,total)
    path.write_bytes(data)

def main():
    if len(sys.argv)!=3:
        print('usage: build_resources.py EXE ICO',file=sys.stderr); return 2
    exe=Path(sys.argv[1]).resolve(); ico=Path(sys.argv[2]).resolve()
    if not exe.is_file() or not ico.is_file(): raise SystemExit('missing input')
    with tempfile.TemporaryDirectory() as td:
        td=Path(td); placeholder=td/'rsrc.bin'; placeholder.write_bytes(build_rsrc(0,ico))
        # Remove an old section if a rebuild is performed.
        probe=pe_info(exe)[5]
        if any(n=='.rsrc' for n,*_ in probe):
            clean=td/'clean.exe'
            subprocess.run(['objcopy','--remove-section','.rsrc',str(exe),str(clean)],check=True)
            os.replace(clean,exe)
        # Place .rsrc immediately after the current PE image. GNU objcopy otherwise
        # chooses a 4GB boundary for PE32+ additions, producing an invalid RVA.
        _,_,_,image_base,section_alignment,secs_before=pe_info(exe)
        next_rva=align(max((va + max(vs,rawsz) for _,vs,va,rawsz,_,_ in secs_before), default=0), section_alignment)
        resource_vma=image_base + next_rva
        added=td/'added.exe'
        subprocess.run([
            'objcopy',
            '--add-section',f'.rsrc={placeholder}',
            '--set-section-flags','.rsrc=alloc,load,readonly,data,contents',
            '--change-section-vma',f'.rsrc=0x{resource_vma:x}',
            str(exe),str(added)
        ],check=True)
        os.replace(added,exe)
        _,_,_,image_base,section_alignment,secs=pe_info(exe)
        rsrc=next((s for s in secs if s[0]=='.rsrc'),None)
        if not rsrc: raise SystemExit('objcopy did not add .rsrc')
        _,vs,rva,rawsz,rawptr,_=rsrc
        if rva != next_rva:
            raise SystemExit(f'unexpected .rsrc RVA 0x{rva:x}; expected 0x{next_rva:x}')
        final=build_rsrc(rva,ico)
        if len(final)>rawsz: raise SystemExit('resource grew beyond allocated raw section')
        data=bytearray(exe.read_bytes())
        data[rawptr:rawptr+len(final)]=final
        if rawsz>len(final): data[rawptr+len(final):rawptr+rawsz]=b'\0'*(rawsz-len(final))
        exe.write_bytes(data)
        image_size=align(rva + max(len(final), rawsz), section_alignment)
        patch_resource_directory(exe,rva,len(final),image_size)
        patch_pe_checksum(exe)
    print(f'embedded icon + manifest: {exe}')
    return 0
if __name__=='__main__': raise SystemExit(main())
